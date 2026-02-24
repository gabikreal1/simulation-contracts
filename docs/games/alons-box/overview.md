# Alon's Box

A trustless crypto-AI guessing game on Solana. An AI hides a **two-word phrase** (e.g., "pink cat"), and players compete to identify it by asking questions and submitting guesses.

## How to Play

1. **A round opens** — The AI generates a secret two-word phrase and commits its hash on-chain
2. **Ask questions** — Pay SOL to ask Yes/No questions (public or private)
3. **Submit guesses** — Pay SOL to guess the phrase (public or private)
4. **Round resolves** — Either someone guesses correctly, the pot hits the cap, or the timer expires
5. **Collect payouts** — Winners and contributors receive SOL automatically from the vault

Public actions are cheaper but visible to everyone. Private actions cost more but preserve your information edge.

## End Conditions

| Condition | What Happens |
|-----------|-------------|
| Correct guess | Winner gets 50%, evidence providers share up to 30%, 5% treasury, 15% rollover |
| Pot reaches cap | 47.5% buyback, 5% treasury, 47.5% rollover |
| Timer expires | 47.5% buyback, 5% treasury, 47.5% rollover |

## Program ID

```
J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa
```

Deployed on **Solana Devnet**. [View on Explorer](https://explorer.solana.com/address/J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa?cluster=devnet)

## Further Reading

- [Rounds](rounds.md) — Round lifecycle, state machine, end conditions
- [Actions and Economy](actions-and-economy.md) — Costs, payouts, evidence mechanics
- [Realms](realms.md) — Themed word pools (coming soon)
- [Developer Docs](../../developers/architecture.md) — Smart contract architecture
- [Contract Reference](../../developers/contracts/alons-box/instructions.md) — Instruction reference
