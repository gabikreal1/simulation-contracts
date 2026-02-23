# Payout Distribution

## Overview

Payout distribution is deterministic and enforced entirely on-chain. The smart contract calculates exact amounts using basis points (BPS, where 10000 BPS = 100%) and transfers SOL directly from the Vault PDA.

## Pool Calculation

The total pool for a round is:

```
pool = round.total_deposits + round.rollover_in
```

Where:
- `total_deposits` = sum of all player deposits in the current round
- `rollover_in` = SOL carried over from the previous round's settlement/expiry

## Settle Distribution (Winner Found)

When a round is settled with a winner:

```
Pool: 100%
├── Winner:     50.0%  (5000 BPS)  → winner wallet
├── Evidence:   ≤30.0% (≤3000 BPS) → evidence wallets
├── Treasury:    5.0%  (500 BPS)   → treasury wallet
└── Rollover:   15.0%  (1500 BPS)  → stays in vault
```

| Recipient | BPS | Formula | Description |
|-----------|-----|---------|-------------|
| Winner | 5000 | `pool * 5000 / 10000` | Player who guessed correctly |
| Evidence | up to 3000 | Sum of `evidence_amounts[]` | Split across evidence providers |
| Treasury | 500 | `pool * 500 / 10000` | Protocol fee |
| Rollover | 1500 | Implicit (stays in vault) | Seeds the next round |

### Evidence Distribution

Evidence payouts are flexible within the 30% cap:

- The backend provides `evidence_amounts: Vec<u64>` with exact lamport values per wallet
- Each amount is transferred to the corresponding wallet in `remaining_accounts`
- The contract validates: `sum(evidence_amounts) <= pool * 3000 / 10000`
- If evidence is less than 30%, the remainder stays in the vault (added to rollover)

**Example:** Pool = 1 SOL (1,000,000,000 lamports)

```
Winner:    500,000,000 lamports (0.5 SOL)
Evidence:  200,000,000 lamports (0.2 SOL) -- two wallets: 150M + 50M
Treasury:   50,000,000 lamports (0.05 SOL)
Rollover:  250,000,000 lamports (0.25 SOL) -- 150M base + 100M unused evidence
```

## Expire Distribution (No Winner)

When a round expires with no winner:

```
Pool: 100%
├── Buyback:   47.5%  (4750 BPS)  → buyback wallet
├── Treasury:   5.0%  (500 BPS)   → treasury wallet
└── Rollover:  47.5%  (4750 BPS)  → stays in vault
```

| Recipient | BPS | Formula | Description |
|-----------|-----|---------|-------------|
| Buyback | 4750 | `pool * 4750 / 10000` | Token buyback mechanism |
| Treasury | 500 | `pool * 500 / 10000` | Protocol fee |
| Rollover | 4750 | Implicit (stays in vault) | Seeds the next round |

**Example:** Pool = 1 SOL

```
Buyback:   475,000,000 lamports (0.475 SOL)
Treasury:   50,000,000 lamports (0.05 SOL)
Rollover:  475,000,000 lamports (0.475 SOL)
```

## Rollover Mechanics

Rollover creates a compounding prize pool across rounds:

```
Round 1: 1.0 SOL deposits → settle → 0.15 SOL rollover
Round 2: 0.5 SOL deposits + 0.15 rollover = 0.65 SOL pool
         → expire → 0.30875 SOL rollover (47.5% of 0.65)
Round 3: 0.8 SOL deposits + 0.30875 rollover = 1.10875 SOL pool
         → settle → 0.1663 SOL rollover
...
```

The rollover amount is calculated at round creation time:

```
rollover_in = vault_lamports - rent_exempt_minimum
```

This captures all remaining SOL in the vault, including:
- Previous round's explicit rollover (15% on settle, 47.5% on expire)
- Any unused evidence allocation from previous settlements

## Arithmetic Safety

All payout calculations use checked arithmetic:

```rust
let winner_amount = pool
    .checked_mul(5000)
    .ok_or(GameError::MathOverflow)?
    .checked_div(10000)
    .ok_or(GameError::MathOverflow)?;
```

If any calculation overflows a `u64`, the transaction fails with `MathOverflow` (error 6004) and no funds are transferred.

## BPS Constants

```rust
const WINNER_BPS: u64 = 5000;      // 50%
const EVIDENCE_CAP_BPS: u64 = 3000; // 30% maximum
const TREASURY_BPS: u64 = 500;      // 5%
const ROLLOVER_BPS: u64 = 1500;     // 15% (settle)

const BUYBACK_BPS: u64 = 4750;      // 47.5% (expire)
const EXPIRE_TREASURY_BPS: u64 = 500; // 5% (expire)
// Remaining 47.5% stays in vault   // (expire rollover)
```
