# Architecture

## System Overview

Alon's Box follows a **commit-reveal + PDA escrow** pattern. The system has three actors:

- **Backend (Authority)** -- Creates rounds, commits answers, triggers settlement/expiry
- **Players** -- Deposit SOL into rounds, submit guesses
- **Smart Contract** -- Holds funds in escrow, verifies commitments, distributes payouts

```
┌─────────────────────────────────────────────────────────┐
│                      BACKEND                            │
│  (Authority Wallet)                                     │
│                                                         │
│  1. Generate answer + salt                              │
│  2. Compute SHA-256(answer:salt)                        │
│  3. Call create_round(commit_hash)                      │
│  4. Call settle(answer, salt) or expire(answer, salt)   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  SOLANA PROGRAM                          │
│  Program ID: FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │GameState │  │  Vault   │  │  Round   │  │Deposit │ │
│  │  PDA     │  │  PDA     │  │  PDA     │  │  PDA   │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       ▲
                       │
┌──────────────────────┴──────────────────────────────────┐
│                     PLAYERS                              │
│                                                         │
│  1. Call deposit(amount) -- SOL goes to Vault PDA       │
│  2. Submit guess to backend                             │
│  3. Receive payout if they win (auto-transferred)       │
└─────────────────────────────────────────────────────────┘
```

## Design Principles

### Trustless Escrow

SOL never touches a human-controlled wallet during the game. All deposits go directly to the Vault PDA, and all payouts come directly from the Vault PDA. The program logic is the only authority over fund movement.

### Commit Before Deposit

The answer hash is committed to the Round PDA **before** any player deposits. This ordering is enforced by the instruction flow: `create_round` must be called before `deposit`. This prevents the backend from seeing deposits and then choosing a favorable answer.

### Deterministic Accounts

All accounts are Program Derived Addresses (PDAs) with deterministic seeds. Anyone can independently derive and verify account addresses:

| Account | Seeds |
|---------|-------|
| GameState | `["game_state"]` |
| Vault | `["vault"]` |
| Round | `["round", round_id as u64 LE bytes]` |
| Deposit | `["deposit", round_id as u64 LE bytes, user_pubkey]` |

### Sequential Rounds

Rounds are strictly sequential. Round N+1 can only be created after round N exists. The contract enforces `round_id == current_round_id + 1`. This prevents:
- Skipping round IDs to manipulate rollover
- Creating duplicate rounds
- Replay attacks on settled/expired rounds

## Data Flow

### Settle Flow (Winner Found)

```
create_round(commit_hash)
       │
       ▼
deposit(amount) ──── Player SOL ───→ Vault PDA
       │
       ▼
settle(answer, salt, evidence_amounts)
       │
       ├──── 50% ──────→ Winner wallet
       ├──── ≤30% ─────→ Evidence wallets (remaining_accounts)
       ├──── 5% ───────→ Treasury wallet
       └──── 15% ──────→ Stays in Vault (rollover)
```

### Expire Flow (No Winner)

```
create_round(commit_hash)
       │
       ▼
deposit(amount) ──── Player SOL ───→ Vault PDA
       │
       ▼
expire(answer, salt)
       │
       ├──── 47.5% ────→ Buyback wallet
       ├──── 5% ───────→ Treasury wallet
       └──── 47.5% ────→ Stays in Vault (rollover)
```

## State Machine

Each round progresses through a simple state machine:

```
  ┌────────┐     settle()     ┌─────────┐
  │ Active │ ───────────────→ │ Settled │
  │        │                  └─────────┘
  │        │     expire()     ┌─────────┐
  │        │ ───────────────→ │ Expired │
  └────────┘                  └─────────┘

  Active:   Accepts deposits, awaiting resolution
  Settled:  Winner paid, answer revealed, round closed
  Expired:  No winner, funds distributed/rolled over
```

Transitions are one-way and irreversible. Once a round is Settled or Expired, it cannot accept deposits or be re-settled/re-expired.

## On-Chain vs Off-Chain

| Operation | Where | Why |
|-----------|-------|-----|
| Answer generation | Off-chain (backend) | AI model inference |
| Commit hash computation | Off-chain (backend) | Pre-round setup |
| Commit hash storage | On-chain | Immutable proof |
| Player deposits | On-chain | Trustless escrow |
| Guess submission | Off-chain (backend) | UX / not needed on-chain |
| Hash verification | On-chain | Trustless verification |
| Payout distribution | On-chain | Trustless transfers |
