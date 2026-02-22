# Overview

## What is Alon's Box?

Alon's Box is a trustless crypto-AI guessing game built on Solana. It combines cryptographic commitment schemes with program-derived account (PDA) escrows to create a provably fair game where:

- An AI generates a secret answer for each round
- The answer is cryptographically committed on-chain **before** any player deposits
- Players deposit SOL and submit their guesses
- The answer is revealed and verified on-chain at settlement
- Payouts are distributed automatically by the smart contract

The core guarantee: **no one can change the answer after players deposit**. The SHA-256 commit hash is the immutable proof.

## Why Solana?

- **Sub-second finality** -- Rounds can be created and settled in real-time
- **Low fees** -- Micro-deposits are practical (even 0.01 SOL)
- **Program Derived Addresses** -- Native support for deterministic escrow accounts
- **Anchor framework** -- Type-safe development with automatic account validation

## Core Concepts

### Rounds

The game operates in sequential rounds. Each round has:
- A **commit hash** (locked answer)
- A **deadline** (unix timestamp)
- A **status** (Active, Settled, or Expired)
- A **prize pool** (total deposits + rollover from previous round)

### Commit-Reveal

The backend generates an answer and a random salt, then commits `SHA-256(answer:salt)` on-chain. When the round ends, the plaintext answer and salt are revealed. The contract recomputes the hash and verifies it matches -- if it doesn't, the transaction fails.

### Escrow

All SOL is held in a single Vault PDA owned by the program. No external wallet ever has custody of player funds. The only way SOL leaves the vault is through the `settle` or `expire` instruction logic.

### Rollover

15% of each settled round's prize pool carries over into the next round, creating growing jackpots. On expire, 47.5% rolls over.

## Program ID

```
FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1
```

Currently deployed on **Solana Devnet**.

## Instruction Flow

```
initialize  -->  create_round  -->  deposit (players)  -->  settle
                      |                                      or
                      |                                     expire
                      v
                 next round (with rollover)
```

| Instruction | Caller | Purpose |
|-------------|--------|---------|
| `initialize` | Authority (once) | Set up GameState + Vault PDAs |
| `create_round` | Authority | Open a new round with committed answer |
| `deposit` | Any player | Deposit SOL into the round's prize pool |
| `settle` | Authority | Reveal answer, verify hash, distribute payouts |
| `expire` | Authority | End round with no winner, distribute/rollover |
