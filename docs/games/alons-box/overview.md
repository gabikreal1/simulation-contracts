# Alon's Box

**A trustless crypto-AI guessing game on Solana.**

---

## High Concept

**Alon's Box** is a short-session, on-chain/social guessing game where an AI hides an object described by a **two-word phrase** (example: *pink cat*), and players compete to identify it.

Players interact with the round in two ways:

- **Ask Yes/No questions** (public or private)
- **Submit guesses** (public or private)

Each interaction has a variable SOL cost. Public actions contribute to collective intelligence (and social drama), while private actions allow strategic play.

The game is designed to create:

- **Urgency** (time-boxed rounds)
- **FOMO** (public signal visibility)
- **Meta strategy** (public vs private actions)
- **Rewarded contribution** (question-askers with "Yes" answers share payout)
- **Token sink / ecosystem support** (buyback, liquidity, treasury)

---

## How It Works

```
Backend commits SHA-256(answer:salt)
        |
   Round opens  -->  Players deposit SOL  -->  Round closes
        |                                           |
        v                                           v
   On-chain hash verified  <--  Backend reveals answer + salt
        |
        v
   Payouts distributed automatically via PDA escrow
```

1. **Commit** -- The backend creates a round with `SHA-256(answer:salt)` locked on-chain
2. **Deposit** -- Players deposit SOL into a program-owned Vault PDA
3. **Reveal** -- The backend reveals the plaintext answer and salt
4. **Verify** -- The contract recomputes the hash and verifies it matches the original commit
5. **Payout** -- SOL is distributed automatically based on game rules

No one -- not even the backend -- can change the answer after players deposit. The hash is the proof.

---

## Round End Conditions

A round resolves when one of the following happens:

1. **Correct Guess** -- Winner receives payout share, contributors rewarded, part of pot rolls forward
2. **Pot Reaches Cap (C SOL)** -- Jackpot protection triggers economy split (buyback + rollover + treasury)
3. **Timer Expires** -- 95% rollover to next round, 5% liquidity pool

---

## MVP Summary

Alon's Box remains:

- Easy to grasp in seconds
- Deep enough for strategy and meta
- Economically self-balancing
- Highly content- and community-friendly

Abstracting costs (**x, y, z, w**), time (**T**), and caps (**C**) future-proofs the design and makes live tuning trivial.

---

## Program ID

```
FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1
```

Currently deployed on **Solana Devnet**.

---

## Documentation

| Section | Description |
|---------|-------------|
| [Development](development/building.md) | Build, test, deploy the smart contract |
| [Game Design](game-design/round-lifecycle.md) | Round mechanics, player actions, realms |
| [Tokenomics](tokenomics/payout-distribution.md) | Payout distribution and rollover mechanics |
