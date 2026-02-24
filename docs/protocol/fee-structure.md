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

```
pool = total_deposits + rollover_from_previous_round
payout = pool * bps / 10_000
```

All arithmetic uses checked operations to prevent overflow. If any calculation would overflow a `u64`, the transaction fails with `MathOverflow` (error 6004).

## Alon's Box Fee Splits

### Settle (Winner Found)

| Recipient | BPS | Percentage | Formula |
|-----------|-----|-----------|---------|
| Winner | 5000 | 50% | `pool * 5000 / 10000` |
| Evidence | up to 3000 | up to 30% | Sum of `evidence_amounts[]` |
| Treasury | 500 | 5% | `pool * 500 / 10000` |
| Rollover | 1500 | 15% | Implicit (stays in vault) |

Evidence payouts are flexible within the 30% cap. Unused evidence allocation is added to rollover.

### Expire (No Winner)

| Recipient | BPS | Percentage | Formula |
|-----------|-----|-----------|---------|
| Buyback | 4750 | 47.5% | `pool * 4750 / 10000` |
| Treasury | 500 | 5% | `pool * 500 / 10000` |
| Rollover | 4750 | 47.5% | Implicit (stays in vault) |

## SSE Prediction Rounds (Suggested)

| Recipient | Share |
|-----------|-------|
| Winners Pool | 85–90% |
| Platform Fee | 5% |
| Liquidity / Friendly Pools | 5% |

These values are configurable per game. See [Actions and Economy](../games/alons-box/actions-and-economy.md) for Alon's Box payout details with worked examples.
