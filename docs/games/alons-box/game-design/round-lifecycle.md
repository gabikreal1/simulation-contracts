# Round Lifecycle

## Round Start

- AI generates and locks a hidden **two-word item** (e.g., "pink cat")
- A new timer **T** begins
- Pot starts at 0 SOL (or inherits rollover from previous round)

---

## During the Round

Players can choose actions:

### A) Ask a Yes/No Question

- **Public question**: costs **x SOL**
  - Visible to everyone
  - AI answers Yes / No (publicly visible)
- **Private question**: costs **y SOL**
  - Visible only to the player
  - AI answer visible only to that player

### B) Submit a Guess

- **Public guess**: costs **z SOL**
  - Visible to everyone
  - If correct, round ends immediately
- **Private guess**: costs **w SOL**
  - Visible only to the player
  - If correct, round ends immediately
  - Winner identity + winning guess revealed after round resolution

---

## Round End Conditions

A round resolves when one of the following happens:

### 1. Correct Guess Submitted

- Winner receives payout share
- Contributors (players who asked questions that received "Yes" answers) are rewarded
- Part of pot rolls forward to next round
- Liquidity allocation sent

### 2. Pot Reaches C SOL Before Correct Guess

"Jackpot protection" economy split:

| Recipient | Share |
|-----------|-------|
| Buyback ($SIMULATION) | 47.5% |
| Rollover to next round | 47.5% |
| Treasury | 5% |

### 3. Timer Reaches T (no winner, pot < C)

| Recipient | Share |
|-----------|-------|
| Rollover to next round | 95% |
| Liquidity pool | 5% |

This preserves momentum and prevents dead rounds.

---

## State Machine

Each round progresses through a simple state machine:

```
  ┌────────┐     settle()     ┌─────────┐
  │ Active │ ───────────────→ │ Settled │
  │        │                  └─────────┘
  │        │     expire()     ┌─────────┐
  │        │ ───────────────→ │ Expired │
  └────────┘                  └─────────┘
```

- **Active**: Accepts deposits, awaiting resolution
- **Settled**: Winner paid, answer revealed, round closed
- **Expired**: No winner, funds distributed/rolled over

Transitions are one-way and irreversible.

---

## Design Intent

The round timer **T** is a critical tension driver:

- Fast enough to sustain excitement
- Long enough for meaningful inference and crowd interaction

Highly streamable, highly social, very "watchable."

---

## AI Rules (Recommended)

- AI hides a two-word phrase from a constrained vocabulary
- AI answers only Yes / No to questions
- Commitment hash + nonce is strongly recommended for fairness and trust
- See [Commit-Reveal](../development/commit-reveal.md) for the on-chain verification mechanism
