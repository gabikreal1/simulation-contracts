# Security Model

## Threat Model

Alon's Box assumes the following adversaries:

| Actor | Threat | Mitigation |
|-------|--------|------------|
| Malicious player | Drain vault, manipulate payouts | PDA escrow, BPS caps, authority checks |
| Compromised backend | Change answer after deposits | Commit-reveal (SHA-256 immutable on-chain) |
| External attacker | Call authority-only instructions | Signer validation against GameState.authority |
| Replay attacker | Re-settle/re-expire a closed round | Round status checks (Active required) |

## Security Guarantees

### 1. Commit-Reveal Integrity

**Guarantee:** The answer cannot be changed after players deposit.

The commit hash (`SHA-256(answer:salt)`) is stored in the Round PDA at creation time, before any `deposit` instruction is possible. At settlement, the contract independently recomputes the hash from the revealed answer and salt, and rejects mismatches with `InvalidCommitHash`.

The backend knows the answer during the round, but cannot profit from this knowledge -- it does not participate as a player, and the payout recipients are specified in the settle instruction accounts.

### 2. Trustless Escrow

**Guarantee:** No wallet has custody of player funds. Only the program controls the Vault.

All SOL is held in the Vault PDA, which is owned by the program. The Vault has no private key -- it can only sign via Anchor's `seeds` constraint. Fund transfers out of the Vault can only occur through:
- `settle` -- distributes according to the fixed BPS formula
- `expire` -- distributes according to the fixed BPS formula

There is no instruction that allows arbitrary withdrawal from the Vault.

### 3. Authority Isolation

**Guarantee:** Only the designated authority can manage rounds.

The authority is set once in `initialize` and stored in `GameState`. Every `create_round`, `settle`, and `expire` instruction validates the signer against `game_state.authority`. An attacker with a different keypair cannot:
- Create rounds
- Settle rounds (directing payouts to themselves)
- Expire rounds

### 4. Sequential Round Enforcement

**Guarantee:** Rounds cannot be skipped, duplicated, or replayed.

The contract enforces `round_id == current_round_id + 1`. This prevents:
- **Skipping:** Creating round 99 to manipulate rollover amounts
- **Duplicating:** Re-creating an existing round (PDA already exists, Anchor rejects)
- **Replaying:** Settling or expiring a round that is already Settled/Expired (status check)

### 5. Evidence Cap

**Guarantee:** Evidence payouts cannot exceed 30% of the pool.

The contract validates `sum(evidence_amounts) <= pool * 3000 / 10000` before any transfers. This prevents a compromised backend from draining the vault through inflated evidence amounts.

Additionally, the contract validates `evidence_amounts.len() == remaining_accounts.len()` to prevent mismatched wallet/amount arrays.

### 6. Treasury Validation

**Guarantee:** The treasury recipient cannot be substituted.

The `settle` instruction validates that the provided treasury account matches `game_state.treasury`. An attacker cannot redirect the 5% treasury fee to their own wallet.

### 7. Overflow Protection

**Guarantee:** Arithmetic cannot silently overflow.

All arithmetic operations use Rust's `checked_add` and `checked_mul`, returning `MathOverflow` error on overflow instead of wrapping. The workspace `Cargo.toml` also enables `overflow-checks = true` for release builds.

## Attack Vectors Covered

### Authorization Attacks

| Attack | Defense | Test |
|--------|---------|------|
| Unauthorized create_round | Signer != authority check | "Rejects unauthorized create_round" |
| Unauthorized settle | Signer != authority check | "Rejects unauthorized settle" |
| Unauthorized expire | Signer != authority check | "Rejects unauthorized expire" |
| Fake treasury in settle | Treasury != game_state.treasury check | "Rejects settle with wrong treasury" |

### Replay Attacks

| Attack | Defense | Test |
|--------|---------|------|
| Double settle | Round status must be Active | "Rejects double settle" |
| Double expire | Round status must be Active | "Rejects double expire" |
| Expire a settled round | Round status must be Active | "Rejects expire on settled round" |
| Deposit into closed round | Round status must be Active | "Rejects deposit on settled/expired round" |

### Payout Manipulation

| Attack | Defense | Test |
|--------|---------|------|
| Inflate evidence amounts | 30% BPS cap enforced | "Rejects evidence overpay" |
| Mismatched evidence wallets | Count validation | "Rejects evidence wallet/amount count mismatch" |
| Wrong commit hash | SHA-256 verification | "Rejects settle with wrong hash" |

### Round ID Manipulation

| Attack | Defense | Test |
|--------|---------|------|
| Skip round IDs | Sequential enforcement | "Rejects skipping round IDs" |
| Duplicate round ID | PDA already exists | "Rejects duplicate round ID" |

## What the Contract Does NOT Protect Against

- **Round timing manipulation:** The backend controls when to call `settle` or `expire`. The `ends_at` timestamp is informational -- it is not enforced on-chain.
- **Answer quality:** The commit-reveal scheme proves the answer was fixed before deposits, but not that it was fair or meaningful.

These are addressed in the roadmap through TEE (Trusted Execution Environment) integration, which adds hardware-attested guarantees to AI answer generation. See the [Roadmap](../roadmap.md).
