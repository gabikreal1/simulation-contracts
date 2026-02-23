# Token Flow

## $SIMULATION Token

$SIMULATION is the ecosystem token that connects all games on the SSE platform. The token benefits from game activity through automated buyback mechanics.

---

## Flow Overview

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

---

## Buyback Mechanism

A portion of every round's settlement pool is routed to the **buyback wallet**. This SOL is used to purchase $SIMULATION tokens from the open market, providing consistent buy pressure.

### When Buyback Occurs

| Resolution Type | Buyback Share | Trigger |
|----------------|---------------|---------|
| Settle (winner found) | Game-specific (e.g., via Friendly Pools liquidity) | Part of settlement |
| Expire (no winner) | Game-specific (e.g., 47.5% in Alon's Box) | Part of expiry distribution |
| Pot cap reached | Game-specific (e.g., 47.5% in Alon's Box) | Economy protection trigger |

### Multi-Game Aggregation

As more games launch on the platform, buyback volume aggregates:

```
Game 1 (Alon's Box) ──→ Buyback Wallet ──→ $SIMULATION buy pressure
Game 2 (Future)     ──→ Buyback Wallet ──→ $SIMULATION buy pressure
Game N              ──→ Buyback Wallet ──→ $SIMULATION buy pressure
```

All games share the same buyback wallet, creating compounding demand.

---

## Treasury

The treasury receives a protocol fee from every round across all games (typically 5%). Treasury funds support:

- Platform development
- Infrastructure costs
- Future game development
- Community initiatives

---

## Rollover

A portion of each round's pool carries over into the next round, creating growing prize pools that attract more players. Rollover stays within the game's own Vault PDA and does not cross between games.
