# Actions and Economy

## Action Costs

| Action | Visibility | Cost | Tradeoff |
|--------|-----------|------|----------|
| Ask question | Public | Configurable | Cheaper, but reveals information to all players |
| Ask question | Private | Configurable | More expensive, but preserves your information edge |
| Submit guess | Public | Configurable | Cheaper, but others see your attempt |
| Submit guess | Private | Configurable | More expensive, but preserves surprise |

All action costs are tunable by the backend for live balancing. The core tradeoff: **public is cheaper but leaks information; private is more expensive but preserves advantage.**

## Public vs Private Strategy

- **Free riders** watch public questions and synthesize the answer from others' work
- **Strategic questioners** use private questions to build exclusive information
- **Public contributors** gain a share of the payout if their questions received "Yes" answers (evidence)
- **Late-round guessers** use accumulated public knowledge for informed attempts

## Payout Distribution

### Settle (Winner Found)

The total pool = player deposits + rollover from previous round.

```
Pool: 100%
├── Winner:     50.0%  (5000 BPS)  → winner wallet
├── Evidence:   ≤30.0% (≤3000 BPS) → evidence provider wallets
├── Treasury:    5.0%  (500 BPS)   → treasury wallet
└── Rollover:   15.0%  (1500 BPS)  → stays in vault
```

| Recipient | BPS | Formula | Description |
|-----------|-----|---------|-------------|
| Winner | 5000 | `pool * 5000 / 10000` | Player who guessed correctly |
| Evidence | up to 3000 | Sum of `evidence_amounts[]` | Split across evidence providers |
| Treasury | 500 | `pool * 500 / 10000` | Protocol fee |
| Rollover | 1500 | Implicit (stays in vault) | Seeds the next round |

### Expire (No Winner)

```
Pool: 100%
├── Buyback:   47.5%  (4750 BPS)  → buyback wallet
├── Treasury:   5.0%  (500 BPS)   → treasury wallet
└── Rollover:  47.5%  (4750 BPS)  → stays in vault
```

## Evidence Mechanics

Evidence payouts reward players whose questions received "Yes" answers — they contributed to narrowing down the hidden phrase.

- The backend provides `evidence_amounts: Vec<u64>` with exact lamport values per wallet
- Each amount is transferred to the corresponding wallet in `remaining_accounts`
- The contract validates: `sum(evidence_amounts) <= pool * 3000 / 10000`
- If evidence is less than 30%, the remainder is added to rollover

**Example:** Pool = 1 SOL (1,000,000,000 lamports)

```
Winner:    500,000,000 lamports (0.5 SOL)
Evidence:  200,000,000 lamports (0.2 SOL) — two wallets: 150M + 50M
Treasury:   50,000,000 lamports (0.05 SOL)
Rollover:  250,000,000 lamports (0.25 SOL) — 150M base + 100M unused evidence
```

## Rollover

Rollover creates compounding prize pools across rounds:

```
Round 1: 1.0 SOL deposits → settle → 0.15 SOL rollover
Round 2: 0.5 SOL deposits + 0.15 rollover = 0.65 SOL pool
         → expire → 0.30875 SOL rollover (47.5% of 0.65)
Round 3: 0.8 SOL deposits + 0.30875 rollover = 1.10875 SOL pool
```

Rollover is calculated at round creation:

```
rollover_in = vault_lamports - rent_exempt_minimum
```

This captures all remaining SOL in the vault, including previous round's explicit rollover and any unused evidence allocation.

## BPS Constants (On-Chain)

```rust
const WINNER_BPS: u64 = 5000;        // 50%
const EVIDENCE_CAP_BPS: u64 = 3000;  // 30% maximum
const TREASURY_BPS: u64 = 500;       // 5%
const ROLLOVER_BPS: u64 = 1500;      // 15% (settle)

const BUYBACK_BPS: u64 = 4750;       // 47.5% (expire)
const EXPIRE_TREASURY_BPS: u64 = 500; // 5% (expire)
// Remaining 47.5% stays in vault     // (expire rollover)
```

All arithmetic uses checked operations. Overflow causes `MathOverflow` (error 6004) and no funds are transferred.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Players share private info off-platform | Acceptable — private questions still cost more |
| Brute-force guessing with multiple accounts | Minimum cost per guess, rate limiting |
| AI answer inconsistency | Commitment hash + deterministic prompts |
| Meta-gaming the AI's vocabulary | Rotating word pools via [Realms](realms.md) |
