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
├── Winner:     50.0%  (5000 BPS)    → winner wallet
├── Evidence:   ≤30.0% (≤3000 BPS)   → evidence provider wallets
├── Treasury:    5.0%  (500 BPS)     → treasury wallet
└── Rollover:   ~15.0% (residual)    → tracked in GameState
```

| Recipient | BPS | Formula | Description |
|-----------|-----|---------|-------------|
| Winner | 5000 | `pool * 5000 / 10000` | Player who guessed correctly |
| Evidence | up to 3000 | Sum of `evidence_amounts[]` | Split across evidence providers |
| Treasury | 500 | `pool * 500 / 10000` | Protocol fee |
| Rollover | residual | `pool - winner - evidence - treasury` | Seeds the next round |

### Expire (No Winner)

Payouts are based on **`total_deposits` only** — previous rollover is fully preserved.

```
Deposits only:
├── Buyback:   47.5%  (4750 BPS)    → buyback wallet
├── Treasury:   5.0%  (500 BPS)     → treasury wallet
└── Rollover:  ~47.5% (residual)    → added to existing rollover
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

Rollover is tracked explicitly in `GameState.rollover_balance` and creates compounding prize pools across rounds:

```
Round 1: 1.0 SOL deposits → settle → rollover = pool - winner - evidence - treasury ≈ 0.15 SOL
Round 2: 0.5 SOL deposits + 0.15 rollover = 0.65 SOL pool
         → expire → buyback = 0.2375, treasury = 0.025
                    rollover_added = 0.5 - 0.2375 - 0.025 = 0.2375
                    new rollover = 0.15 + 0.2375 = 0.3875 SOL
Round 3: 0.8 SOL deposits + 0.3875 rollover = 1.1875 SOL pool
```

Key properties:
- Rollover is read from `game_state.rollover_balance` at round creation (not derived from vault balance)
- On **settle**: rollover is the residual after paying winner, evidence, and treasury
- On **expire**: only current deposits are split; previous rollover is fully preserved
- Unsolicited SOL transfers to the vault are ignored by game math

## BPS Constants (On-Chain)

```rust
// Settle (winner found) — applied to full pool
const WINNER_BPS: u64 = 5000;        // 50%
const EVIDENCE_CAP_BPS: u64 = 3000;  // 30% maximum
const TREASURY_BPS: u64 = 500;       // 5%
// Rollover = pool - winner - evidence - treasury (residual, ~15%)

// Expire (no winner) — applied to total_deposits only
const BUYBACK_BPS: u64 = 4750;       // 47.5%
const EXPIRE_TREASURY_BPS: u64 = 500; // 5%
// Rollover added = total_deposits - buyback - treasury (residual, ~47.5%)
// New rollover = old rollover + rollover added
```

All arithmetic uses checked operations. Overflow causes `MathOverflow` (error 6004) and no funds are transferred. Rollover is always computed as a **residual** (subtraction) to capture all integer-division rounding dust.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Players share private info off-platform | Acceptable — private questions still cost more |
| Brute-force guessing with multiple accounts | Minimum cost per guess, rate limiting |
| AI answer inconsistency | Commitment hash + deterministic prompts |
| Meta-gaming the AI's vocabulary | Rotating word pools via [Realms](realms.md) |
