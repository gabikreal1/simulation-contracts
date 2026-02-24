# Security Audit: Alon's Box Smart Contract

**Program:** `J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa`
**Network:** Solana Devnet
**Framework:** Anchor 0.31.1
**Audit Date:** February 2026

---

## 1. Source Code Completeness

All instruction source code is present and auditable:

| File | Present | Content |
|------|---------|---------|
| `lib.rs` | Yes | Entry point, instruction routing, module declarations |
| `state.rs` | Yes | Account structs, size constants |
| `errors.rs` | Yes | 12 custom error codes (6000-6011) |
| `events.rs` | Yes | 8 event definitions for on-chain monitoring |
| `utils.rs` | Yes | Shared vault transfer helper |
| `instructions/` | Yes | All 8 instruction handlers |

**Assessment:** Full source is available for audit. All instruction logic, account constraints, and fund transfer mechanisms are reviewable.

---

## 2. Architecture Review

### Account Model

Four PDA types with deterministic seeds:

| Account | Seeds | Size | Purpose |
|---------|-------|------|---------|
| GameState | `["game_state"]` | 113 bytes | Global singleton: authority, treasury, buyback, round counter |
| Vault | `["vault"]` | 9 bytes | Singleton SOL escrow |
| Round | `["round", round_id_le]` | 242 bytes | Per-round state |
| Deposit | `["deposit", round_id_le, user_pubkey]` | 57 bytes | Per-user per-round deposit tracking |

**Assessment:** Seed design is correct. Seeds are specific enough to prevent collisions. Round IDs use little-endian u64 bytes, which is standard for Anchor PDA derivation.

### Size Calculation Verification

**GameState:** `8 (disc) + 32 + 32 + 32 + 8 + 1 = 113` -- Correct.

**Round:** `8 (disc) + 8 + 32 + 32 + 8 + 1 + 8 + 8 + (4+64) + (4+64) + 1 = 242` -- Correct. The String fields allocate 4 bytes for length prefix + 64 bytes for data.

**Deposit:** `8 (disc) + 8 + 32 + 8 + 1 = 57` -- Correct. Includes bump seed.

**Vault:** `8 (disc) + 1 = 9` -- Correct. Minimal -- only stores the bump seed. SOL is held via lamport balance.

### Instruction Set

| Instruction | Access | Purpose |
|-------------|--------|---------|
| `initialize` | One-time | Create GameState and Vault PDAs |
| `create_round` | Authority | Open round with commit hash and `ends_at` validation |
| `deposit` | Public | Deposit SOL into active round |
| `settle` | Authority | Resolve with winner, verify hash, distribute payouts |
| `expire` | Authority | No-winner resolution, verify hash, distribute funds |
| `emergency_expire` | Permissionless | Dead man's switch after 24hr grace period |
| `close_deposit` | Authority | Close Deposit PDA, recover rent |
| `close_round` | Authority | Close Round PDA, recover rent |

### State Machine

Round status: `Active -> Settled` or `Active -> Expired`. All instructions enforce:
- `settle`, `expire`, `emergency_expire`: require `status == Active`
- `close_deposit`, `close_round`: require `status != Active`
- No backward transitions possible

**Assessment:** State machine is correct and well-tested.

### Authority Model

Single authority wallet set at `initialize`. Constraints verified in source:
- `create_round`: `game_state.authority == authority.key()` (create_round.rs:13)
- `settle`: `game_state.authority == authority.key()` (settle.rs:16)
- `expire`: `game_state.authority == authority.key()` (expire.rs:16)
- `close_deposit`: `game_state.authority == authority.key()` (close_deposit.rs:14)
- `close_round`: `game_state.authority == authority.key()` (close_round.rs:14)
- `emergency_expire`: No authority check (intentionally permissionless)
- Treasury: validated in `settle` and `expire` and `emergency_expire`
- Buyback wallet: validated in `expire` and `emergency_expire`

**Assessment:** Authority model is sound. The permissionless `emergency_expire` is properly time-gated.

### Event Coverage

All state-mutating instructions emit events:

| Event | Instruction | Fields |
|-------|-------------|--------|
| `GameInitialized` | `initialize` | authority, treasury, buyback_wallet |
| `RoundCreated` | `create_round` | round_id, ends_at, rollover_in |
| `DepositMade` | `deposit` | round_id, player, amount, total_deposits |
| `RoundSettled` | `settle` | round_id, winner, pool, winner_amount, evidence_total, treasury_amount |
| `RoundExpired` | `expire` | round_id, pool, buyback_amount, treasury_amount |
| `EmergencyExpired` | `emergency_expire` | round_id, pool, buyback_amount, treasury_amount, caller |
| `DepositClosed` | `close_deposit` | round_id, player, rent_recovered |
| `RoundClosed` | `close_round` | round_id, rent_recovered |

**Assessment:** Complete event coverage enables off-chain monitoring and indexing.

---

## 3. Vulnerability Analysis

### 3.1 Access Control

**Verified in source:**
- `create_round`: authority constraint at account level (create_round.rs:13)
- `settle`: authority constraint at account level (settle.rs:16)
- `expire`: authority constraint at account level (expire.rs:16)
- `close_deposit` / `close_round`: authority constraint at account level
- Treasury validated against `game_state.treasury` in settle (settle.rs:42), expire (expire.rs:37), and emergency_expire (emergency_expire.rs:36)
- Buyback wallet validated against `game_state.buyback_wallet` in expire (expire.rs:45) and emergency_expire (emergency_expire.rs:44)

**Assessment:** All access control checks are present and correct at the Anchor constraint level.

### 3.2 Fund Safety

**Vault PDA escrow:** Funds are held in a program-owned PDA. No instruction allows arbitrary withdrawal -- only `settle`, `expire`, and `emergency_expire` move funds, with fixed BPS formulas. This is the correct pattern.

**Transfer helper:** All vault transfers use `utils::transfer_from_vault`, which performs direct lamport manipulation on the program-owned Vault PDA. The helper correctly skips zero-amount transfers.

**Rent recovery:** `close_deposit` and `close_round` use Anchor's `close` constraint to return rent to the authority. Both require `round.status != Active`, preventing premature closure.

**Assessment:** Fund safety is well-implemented. Rent recovery addresses the previously identified rent leakage concern.

### 3.3 Arithmetic Safety

**Cargo.toml** enables `overflow-checks = true` for release builds. All arithmetic operations use `checked_add`, `checked_mul`, and `checked_div`, returning `MathOverflow` (6004) on overflow.

**BPS rounding analysis:**

Settle: `5000 + 3000 (max) + 500 + 1500 = 10,000` -- adds up correctly.
Expire: `4750 + 500 + 4750 = 10,000` -- adds up correctly.

**Rounding dust:** Integer division truncates. For `pool * 5000 / 10000`, the maximum rounding loss is 1 lamport per calculation. With 4 payouts on settle, worst case is 4 lamports dust remaining in the vault per round. This dust accumulates in the vault and becomes part of the next round's rollover -- not lost, but not explicitly tracked.

**Assessment:** Arithmetic is safe. Dust accumulation is negligible and self-correcting via rollover.

### 3.4 Replay / Manipulation

**Sequential round IDs:** `create_round` enforces `round_id == current_round_id + 1`. Tests confirm skipping and duplication are rejected.

**Double-action prevention:** All resolution instructions require `round.status == Active`. Once transitioned, the round cannot be settled or expired again.

**Assessment:** Replay protection is solid.

### 3.5 Commit-Reveal Integrity

**Hash scheme:** `SHA-256(answer:salt)` with the colon separator. SHA-256 provides pre-image resistance -- players cannot derive the answer from the on-chain hash.

**Verification in source:** Both `settle` (settle.rs:60-65) and `expire` (expire.rs:55-60) independently compute `hash(format!("{}:{}", answer, salt))` and compare against the stored commit hash.

**Salt entropy:** Salt is generated off-chain by the backend. See Finding F-03.

**Answer length limit:** 64 bytes for both answer and salt (errors 6005, 6006). Sufficient for the two-word phrase format.

**Non-repudiation:** `revealed_answer` and `revealed_salt` are stored on-chain in the Round PDA after settlement. Anyone can verify `SHA-256(revealed_answer:revealed_salt) == commit_hash`.

**Note:** `emergency_expire` does not reveal the answer (the authority is offline). The answer is forfeit in emergency scenarios.

### 3.6 Account Validation

**`init_if_needed` on Deposit:** The program uses Anchor's `init-if-needed` feature (enabled in Cargo.toml). The deposit handler correctly detects first-time initialization by checking `deposit.user == Pubkey::default()` and only sets static fields on first deposit (deposit.rs:64-68).

**Assessment:** Acceptable with Anchor 0.31.1's built-in protections. The initialization guard is properly implemented.

### 3.7 Denial of Service

**Emergency expire:** The `emergency_expire` instruction addresses the authority-offline scenario. Anyone can call it 24 hours after `round.ends_at`. This prevents permanent fund lock if the authority wallet is lost or the backend goes offline.

**Timer validation:** `create_round` validates `ends_at > clock.unix_timestamp` (create_round.rs:54), ensuring rounds cannot be created with past deadlines.

**Assessment:** The emergency dead man's switch adequately mitigates the authority-offline DoS risk. The 24-hour grace period prevents griefing.

### 3.8 Deposit Amount Validation

The `deposit` instruction accepts any `u64` amount including 0. A zero-deposit creates a Deposit PDA with 0 lamports, paying only rent. Not economically viable as a griefing vector since the attacker pays rent.

**See Finding F-04.**

### 3.9 Account Closing

**close_deposit:** Closes Deposit PDAs after round settlement/expiry. Uses Anchor `close = authority` constraint. Requires `round.status != Active` to prevent premature closure. Rent returned to authority.

**close_round:** Closes Round PDAs after settlement/expiry. Same pattern. Requires `round.status != Active`.

**Assessment:** Account closing is correctly gated. The authority receives rent, which is appropriate since the authority pays for Round PDA creation and can batch close operations.

---

## 4. Economic Analysis

### Payout Completeness

**Settle:** Winner (50%) + Evidence (up to 30%) + Treasury (5%) + Rollover (15%) = 100%. If evidence < 30%, the remainder stays as rollover. Total outflows from vault = winner + evidence + treasury. The rest stays in vault. This is correct.

**Expire / Emergency Expire:** Buyback (47.5%) + Treasury (5%) + Rollover (47.5%) = 100%. Total outflows from vault = buyback + treasury. The rest stays in vault. This is correct.

### Rent Recovery

With `close_deposit` and `close_round`:

| Account | Rent | Recoverable |
|---------|------|-------------|
| Round PDA | ~0.0025 SOL | Yes, via `close_round` |
| Deposit PDA | ~0.001 SOL | Yes, via `close_deposit` |

**Assessment:** Rent is fully recoverable after round completion. The authority can batch close operations to recover all rent.

### Rollover Calculation

`rollover_in = vault_lamports - rent_exempt_minimum`

Calculated for the Vault PDA only (9 bytes, ~0.00089 SOL rent). Correctly excludes the vault's rent-exempt minimum from the pool.

**Assessment:** Rollover calculation is correct.

---

## 5. Test Coverage Assessment

### Coverage Summary

| Category | Tests | Coverage |
|----------|-------|---------|
| Core flows | ~8 | Full lifecycle with balance verification |
| Auth attacks | ~4 | Unauthorized create/settle/expire/wallet mismatch |
| Replay attacks | ~4 | Double settle/expire, cross-status |
| Payout manipulation | ~3 | Evidence cap, wallet mismatch, hash verification |
| Round ID manipulation | ~2 | Skip and duplicate |
| Emergency expire | ~3 | Grace period, permissionless access |
| Account closing | ~3 | Close deposit/round, rent recovery |
| Edge cases | ~2 | Timer validation, additional scenarios |
| **Total** | **29** | |

### Missing Test Scenarios

| Scenario | Why It Matters |
|----------|---------------|
| Zero-amount deposit | Could create empty Deposit PDAs |
| Maximum evidence providers | Large `remaining_accounts` array could hit compute limits |
| Settle with 0 total deposits | Edge case -- pool = rollover only |
| Very large pool (near u64 max) | Overflow on `pool * bps` before division |
| Evidence amounts summing to exactly 30% boundary | Off-by-one at the cap |

---

## 6. Findings Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| F-01 | **Medium** | Salt entropy depends on backend implementation | Open |
| F-02 | **Low** | Single authority -- centralization risk | Open |
| F-03 | **Low** | No minimum deposit amount validation | Open |
| F-04 | **Informational** | `init_if_needed` usage is acceptable with Anchor 0.31.1 | Accepted |
| F-05 | **Informational** | Rounding dust accumulates in vault (self-correcting via rollover) | Accepted |

### Previously Reported -- Now Resolved

| ID | Original Severity | Title | Resolution |
|----|-------------------|-------|------------|
| F-00 | Critical | Instruction source code missing | **RESOLVED** -- All instruction source code is now in `instructions/` directory |
| F-01-old | High | Buyback wallet not validated in `expire` | **RESOLVED** -- Constraint `buyback_wallet.key() == game_state.buyback_wallet` exists in expire.rs:45 and emergency_expire.rs:44 |
| F-02-old | Medium | Accounts never closed -- rent leakage | **RESOLVED** -- `close_deposit` and `close_round` instructions added |
| F-04-old | Medium | No timeout -- authority can block fund recovery | **RESOLVED** -- `emergency_expire` added with 24-hour grace period after `ends_at` |
| F-05-old | Medium | Round timer not enforced on-chain | **PARTIALLY RESOLVED** -- `create_round` validates `ends_at > clock.unix_timestamp`. Deposit-time enforcement not added (backend controls round closure). Emergency expire uses `ends_at` + 24hr as the permissionless trigger. |

---

## 7. Detailed Findings

### F-01: Salt Entropy Depends on Backend Implementation [MEDIUM]

**Description:** The commit hash is `SHA-256(answer:salt)`. The answer space is constrained (two-word phrases from a limited vocabulary). If the salt has low entropy (e.g., derived from a timestamp or counter), an attacker could brute-force the answer by trying all possible two-word phrases with the guessed salt against the on-chain commit hash.

**Impact:** If the salt is predictable, the commit-reveal scheme is broken -- the answer can be derived before the round ends.

**Recommendation:**
1. Generate salt using `crypto.randomBytes(32)` (256 bits of entropy)
2. Document the minimum salt entropy requirement
3. Consider increasing the salt length or using a dedicated HMAC construction

---

### F-02: Single Authority -- Centralization Risk [LOW]

**Description:** All privileged operations (create_round, settle, expire, close_deposit, close_round) require a single authority wallet set at initialization. The authority cannot be changed or upgraded.

**Impact:** If the authority key is compromised, the attacker controls all round operations. If it's lost, `emergency_expire` handles fund recovery but the program becomes unusable for new rounds.

**Recommendation:** For mainnet:
1. Use a multisig (e.g., Squads) as the authority
2. Consider adding an `update_authority` instruction gated by the current authority
3. The TEE roadmap (Phase 3) will partially address this

---

### F-03: No Minimum Deposit Amount [LOW]

**Description:** The `deposit` instruction accepts any `u64` amount including 0. A zero-deposit creates a Deposit PDA and increments `round.total_deposits` by 0.

**Impact:** Minimal -- the attacker pays rent (~0.001 SOL) to create an empty Deposit account. Not economically viable as a griefing vector. However, it creates unnecessary on-chain state.

**Recommendation:** Add `require!(amount > 0, InvalidAmount)` to the deposit instruction.

---

### F-04: `init_if_needed` Usage [INFORMATIONAL]

**Description:** The Deposit PDA uses Anchor's `init_if_needed` feature to handle both first-time and subsequent deposits in a single instruction. This feature had known re-initialization vulnerabilities in older Anchor versions.

**Assessment:** Anchor 0.31.1 handles this correctly by checking the account discriminator. The handler additionally checks `deposit.user == Pubkey::default()` to detect first-time initialization (deposit.rs:64). This is safe.

---

### F-05: Rounding Dust [INFORMATIONAL]

**Description:** Integer division in BPS calculations truncates, potentially leaving up to 4 lamports per settle and 2 lamports per expire as dust in the vault.

**Assessment:** This dust becomes part of the next round's rollover and is not lost. Over millions of rounds, dust accumulation is negligible relative to pool sizes. No action needed.

---

## 8. Dependency Review

| Dependency | Version | Risk |
|------------|---------|------|
| `anchor-lang` | 0.31.1 | Stable release. The `init-if-needed` feature is used and is safe in this version. |
| `blake3` | =1.5.5 (pinned) | Build dependency only (used by Anchor/Solana toolchain). Pinned to pre-edition2024 version for compatibility with platform-tools rustc 1.84. Not used in program logic. |

**Rust profile:** `overflow-checks = true`, `lto = "fat"`, `codegen-units = 1`. This is the recommended secure configuration for Solana programs.

---

## 9. Recommendations Priority

| Priority | Action |
|----------|--------|
| **P1 -- Before mainnet** | Use multisig for authority |
| **P2 -- Recommended** | Add minimum deposit amount validation |
| **P2 -- Recommended** | Document salt entropy requirements |
| **P3 -- Nice to have** | Add missing test scenarios from Section 5 |

---

## 10. Conclusion

The contract architecture is well-designed and the full source code is available for audit. The commit-reveal scheme, PDA escrow, sequential round management, and BPS payout system are structurally sound. All account constraints are correctly implemented at the Anchor framework level.

Key security improvements since the initial review:
- **Full instruction source code** is present and auditable
- **Buyback wallet validation** is enforced via Anchor constraints in both `expire` and `emergency_expire`
- **Account closing** (`close_deposit`, `close_round`) recovers rent from settled/expired rounds
- **Emergency dead man's switch** (`emergency_expire`) prevents permanent fund lock if the authority goes offline
- **Round timer validation** (`ends_at > now`) prevents creation of rounds with past deadlines
- **On-chain events** provide complete audit trail for all state transitions

The remaining findings are low-severity and informational. The most impactful improvement for mainnet readiness is adopting a multisig authority.
