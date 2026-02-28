# Fee Structure

Every game in the SSE ecosystem follows a consistent fee routing pattern with game-specific ratios.

## Fee Destinations

| Destination | Wallet | Purpose |
|-------------|--------|---------|
| Winners Pool | Player wallets | Game-specific payouts to winners/contributors |
| Treasury | `GameState.treasury` | Protocol revenue |
| Buyback | `GameState.buyback_wallet` | $SIMULATION token buyback |
| Rollover | Vault PDA (internal) | Next round's starting pool |
| Liquidity | Friendly Pools | LP provision for $SIMULATION |

## BPS Calculation

All games use basis points (BPS) for payout calculation. 10,000 BPS = 100%.

All arithmetic uses checked operations to prevent overflow. If any calculation would overflow a `u64`, the transaction fails with `MathOverflow` (error 6004).

## Alon's Box Fee Splits

### Settle (Winner Found)

```
pool = total_deposits + rollover_in
```

| Recipient | BPS | Percentage | Formula |
|-----------|-----|-----------|---------|
| Winner | 5000 | 50% | `pool * 5000 / 10000` |
| Evidence | up to 3000 | up to 30% | Sum of `evidence_amounts[]` |
| Treasury | 500 | 5% | `pool * 500 / 10000` |
| Rollover | ~15% (residual) | — | `pool - winner - evidence - treasury` |

Evidence payouts are flexible within the 30% cap. Unused evidence allocation is added to rollover. Rollover is computed as a **residual** (subtraction), capturing all integer-division rounding dust.

### Expire (No Winner)

Payouts are based on **`total_deposits` only** — previous rollover is fully preserved.

| Recipient | BPS | Percentage | Formula |
|-----------|-----|-----------|---------|
| Buyback | 4750 | 47.5% | `total_deposits * 4750 / 10000` |
| Treasury | 500 | 5% | `total_deposits * 500 / 10000` |
| Rollover added | ~47.5% (residual) | — | `total_deposits - buyback - treasury` |

New rollover = old rollover + rollover added. The `rollover_added` is computed as a residual to absorb rounding dust.

### Explicit Rollover Tracking

Rollover is tracked explicitly in `GameState.rollover_balance` rather than derived from the vault's lamport balance. This means:
- Unsolicited SOL transfers to the vault are ignored by game math
- Vault balance invariant: `vault_lamports = rollover_balance + rent + active_deposits`

## SSE Prediction Rounds (Suggested)

| Recipient | Share |
|-----------|-------|
| Winners Pool | 85–90% |
| Platform Fee | 5% |
| Liquidity / Friendly Pools | 5% |

These values are configurable per game. See [Actions and Economy](../games/alons-box/actions-and-economy.md) for Alon's Box payout details with worked examples.
