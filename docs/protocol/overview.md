# SSE Protocol

Simulated Synthetic Events (SSE) is the protocol powering all games on the SIMULATION platform. Each game runs rounds that follow the same lifecycle, use on-chain escrow for funds, and resolve through AI or cryptographic verification.

## Round Lifecycle

Every round progresses through six stages:

```
Briefing → Injection → Lock → Verdict → Settlement → Archive
```

| Stage | What Happens |
|-------|-------------|
| **Briefing** | AI Architect generates a scenario or hides a secret answer |
| **Injection** | Players stake SOL and submit actions (arguments, questions, guesses) |
| **Lock** | Round stops accepting new inputs (timer expires or end condition met) |
| **Verdict** | AI Judge evaluates inputs, or commit-reveal verifies the answer |
| **Settlement** | Payouts distributed on-chain from Vault PDA to recipients |
| **Archive** | Round data (inputs, stakes, verdict, payouts) stored permanently |

## Resolution Types

SSE supports two resolution models:

### AI Adjudication (SSE Prediction Rounds)

Players pick sides on a synthetic conflict and submit arguments. The [AI Judge](ai-systems.md) evaluates argument quality, coherence, and stake-weighted confidence to determine the winning side. The verdict and rationale are published.

### Cryptographic Verification (Alon's Box)

The AI commits a `SHA-256(answer:salt)` hash on-chain before any deposits. At resolution, the plaintext answer and salt are revealed, and the contract verifies the hash matches. No trust in the backend required — the math is the proof.

## How SSE Differs from Prediction Markets

Traditional prediction markets resolve against real-world facts via external oracles. SSE generates its own outcomes — events are synthetic, and resolution is internal to the protocol. Players are participants who influence the outcome, not passive bettors waiting on external data.

## On-Chain Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Fund safety | PDA escrow — no wallet has custody |
| Answer immutability | Commit hash stored on-chain before deposits |
| Payout correctness | Deterministic BPS calculation, verifiable on-chain |
| Round integrity | Sequential IDs prevent replay/skip attacks |
| Fee transparency | Treasury and buyback addresses locked at initialization |

See [Trust Model](trust-model.md) for the full security analysis.

## Fee Routing

Every round's settlement pool is split between winners, the protocol treasury, token buyback, and rollover to the next round. See [Fee Structure](fee-structure.md) for exact splits.

## Further Reading

- [AI Systems](ai-systems.md) — How AI Architect and AI Judge work
- [Trust Model](trust-model.md) — On-chain guarantees and TEE roadmap
- [Fee Structure](fee-structure.md) — Where fees go
- [Alon's Box](../games/alons-box/overview.md) — The first game on SSE
