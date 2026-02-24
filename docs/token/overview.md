# $SIMULATION Token

$SIMULATION is the ecosystem token connecting all games on the SSE platform. It benefits from game activity through automated buyback mechanics.

## Utility

- **Buyback sink** — A portion of every round's settlement is used to purchase $SIMULATION from the open market
- **Liquidity provision** — Friendly Pools provide trading liquidity for $SIMULATION
- **Treasury funding** — Protocol fees fund development, infrastructure, and community initiatives

## Buyback Mechanism

A portion of every round's settlement pool is routed to the buyback wallet. This SOL is used to purchase $SIMULATION tokens, creating consistent buy pressure.

### When Buyback Occurs

| Resolution Type | Buyback Share | Example |
|----------------|---------------|---------|
| Settle (winner found) | Via Friendly Pools liquidity | Part of settlement |
| Expire (no winner) | 47.5% of pool (Alon's Box) | Direct buyback |
| Pot cap reached | 47.5% of pool (Alon's Box) | Economy protection trigger |

### Multi-Game Aggregation

As more games launch, buyback volume compounds:

```
Game 1 (Alon's Box) ──→ Buyback Wallet ──→ $SIMULATION buy pressure
Game 2 (Future)     ──→ Buyback Wallet ──→ $SIMULATION buy pressure
Game N              ──→ Buyback Wallet ──→ $SIMULATION buy pressure
```

All games share the same buyback wallet, creating aggregated demand across the ecosystem.

## Treasury

The treasury receives a 5% protocol fee from every round across all games. Treasury funds support:

- Platform development
- Infrastructure costs
- Future game development
- Community initiatives

Treasury and buyback wallet addresses are set at program initialization and cannot be changed afterward.

## Token Flow

```
Player deposits (SOL)
        │
        ▼
  ┌─────────────────┐
  │   Game Vault     │
  │   (PDA Escrow)   │
  └────────┬────────┘
           │
     Round Resolution
           │
  ┌────────┼──────────────────┐
  │        │                  │
  ▼        ▼                  ▼
Payouts  Treasury          Buyback
(SOL)    (SOL)            (SOL → $SIMULATION)
  │        │                  │
  │        ▼                  ▼
  │   Protocol revenue   Token support
  │                      (liquidity/burn)
  ▼
Players + Rollover
```

## Rollover

A portion of each round's pool carries over into the next round, creating growing prize pools. Rollover stays within each game's Vault PDA and does not cross between games.
