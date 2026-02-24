# Rounds

Each round of Alon's Box is a self-contained game session with a fixed hidden answer, a timer, and a prize pool.

## Round Start

1. The AI generates a secret two-word phrase (e.g., "red apple")
2. The backend computes `SHA-256(answer:salt)` and calls `create_round` with the hash
3. The hash is stored immutably on-chain — it cannot be changed after this point
4. The round timer starts
5. The pot starts at 0 SOL (or inherits rollover from the previous round)

## During the Round

Players interact by depositing SOL:

| Action | Visibility | Effect |
|--------|-----------|--------|
| Ask a Yes/No question | Public | AI answers publicly, visible to all |
| Ask a Yes/No question | Private | AI answers privately, visible only to asker |
| Submit a guess | Public | If correct, round ends immediately. Visible to all |
| Submit a guess | Private | If correct, round ends immediately. Winner revealed after resolution |

See [Actions and Economy](actions-and-economy.md) for costs and strategic tradeoffs.

## End Conditions

### 1. Correct Guess Submitted

The round settles immediately. Payouts:

| Recipient | Share |
|-----------|-------|
| Winner | 50% (5000 BPS) |
| Evidence providers | Up to 30% (3000 BPS cap) |
| Treasury | 5% (500 BPS) |
| Rollover | 15% (1500 BPS) |

### 2. Pot Reaches Cap

Economy protection triggers when the pot hits a configurable SOL cap:

| Recipient | Share |
|-----------|-------|
| Buyback ($SIMULATION) | 47.5% (4750 BPS) |
| Treasury | 5% (500 BPS) |
| Rollover | 47.5% (4750 BPS) |

### 3. Timer Expires (No Winner, Pot Below Cap)

| Recipient | Share |
|-----------|-------|
| Buyback ($SIMULATION) | 47.5% (4750 BPS) |
| Treasury | 5% (500 BPS) |
| Rollover | 47.5% (4750 BPS) |

## State Machine

```
  ┌────────┐     settle()     ┌─────────┐
  │ Active │ ───────────────→ │ Settled │
  │        │                  └─────────┘
  │        │     expire()     ┌─────────┐
  │        │ ───────────────→ │ Expired │
  └────────┘                  └─────────┘
```

- **Active** — Accepts deposits, awaiting resolution
- **Settled** — Winner paid, answer revealed, round closed
- **Expired** — No winner, funds distributed/rolled over

Transitions are one-way and irreversible. Once settled or expired, a round cannot accept deposits or be re-resolved.

## Configurable Parameters

| Parameter | Description | Set By |
|-----------|-------------|--------|
| Timer duration | Round length | Backend (passed to `create_round` as `ends_at`) |
| Pot cap | Maximum pool size before economy protection triggers | Backend |
| Action costs | SOL cost per question/guess type | Backend |

The timer deadline (`ends_at`) is stored on-chain but not enforced by the contract — the backend is responsible for calling `settle` or `expire` at the right time. TEE integration will add enforcement guarantees (see [Trust Model](../../protocol/trust-model.md)).
