# Fee Structure

## General Principles

Every game in the SSE ecosystem follows a consistent fee structure with game-specific ratios:

1. **Winners/participants** receive the majority of the pool
2. **Treasury** receives a protocol fee (typically 5%)
3. **Buyback** receives a portion for $SIMULATION token support
4. **Rollover** seeds the next round's prize pool

---

## Fee Destinations

| Destination | Wallet | Purpose |
|-------------|--------|---------|
| Winners Pool | Player wallets | Game-specific payouts to winners/contributors |
| Treasury | `GameState.treasury` | Protocol revenue |
| Buyback | `GameState.buyback_wallet` | $SIMULATION token buyback |
| Rollover | Vault PDA (internal) | Next round's starting pool |
| Liquidity | Friendly Pools | LP provision for $SIMULATION |

---

## Per-Game Fee Tables

Each game defines its own BPS (basis points) split. See individual game tokenomics docs for exact numbers:

- [Alon's Box: Payout Distribution](../../games/alons-box/tokenomics/payout-distribution.md)

---

## Settlement Calculation

All games use the same base calculation:

```
pool = total_deposits + rollover_from_previous_round
payout = pool * bps / 10_000
```

Where `bps` is a basis-point value (e.g., 5000 = 50%, 500 = 5%).

All arithmetic uses checked operations to prevent overflow.

---

## Suggested MVP Splits

For new games joining the platform, suggested starting splits:

### Winner-Based Games (like Alon's Box)

| Recipient | Settle (winner) | Expire (no winner) |
|-----------|-----------------|-------------------|
| Winners | 50% | -- |
| Contributors | up to 30% | -- |
| Buyback | -- | 47.5% |
| Treasury | 5% | 5% |
| Rollover | 15% | 47.5% |

### Two-Sided Prediction Games (like SSE rounds)

| Recipient | Share |
|-----------|-------|
| Winners Pool | 85-90% |
| Platform Fee | 5% |
| Liquidity / Friendly Pools | 5% |

These are starting suggestions. All values are tunable per game.
