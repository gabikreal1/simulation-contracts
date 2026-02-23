# Trust and Fairness

## AI Trust Problem

Users will ask: "Did AI choose fairly?"

### Answer Strategy

Trust comes from **protocol transparency**, not "trust us."

Required:
- Public adjudication prompt framework
- Stable rules
- Visible rationale every round
- Archived inputs + outputs
- Consistency over time

---

## Whale Resistance

SSE explicitly rejects "more money = guaranteed win."

### Design Rule

Stake influences weight, but weak logic can lose. This principle applies across all games:

- In guessing games: spending more on questions/guesses gives more attempts, but doesn't guarantee the answer
- In prediction rounds: larger stakes add weight, but the AI Judge evaluates argument quality independently

This is one of the strongest differentiators and should be stated everywhere: docs, UI, onboarding, FAQs.

---

## Moderation Boundaries

The platform benefits from expressive interaction, but needs minimal safety rails.

### Allow

- Absurdity
- Bluffing
- Taunts
- Narrative threats ("AI choose us or face collapse")
- Memes / roleplay

### Block / Redact

- Real-world violent threats
- Doxxing
- Slurs / severe harassment
- Illegal content

Recommended UX:
- Keep bet/action valid
- Redact message if needed (`[redacted by system]`)

---

## On-Chain Verification

All games share these trustless guarantees:

| Guarantee | Mechanism |
|-----------|-----------|
| Answer immutability | Commit hash stored on-chain before deposits |
| Fund safety | PDA escrow -- no external wallet has custody |
| Payout correctness | Deterministic BPS calculation, verifiable on-chain |
| Round integrity | Sequential IDs prevent replay/skip attacks |
| Fee transparency | Treasury and buyback addresses locked at initialization |

---

## Future: TEE Attestation

Moving AI inference into Trusted Execution Environments (Phala Network) adds hardware-level trust:

- The exact code and model that ran is verifiable via Intel TDX attestation
- No one, including the node operator, can observe or tamper with the inference
- Attestation reports stored on-chain per round

See [Roadmap](../roadmap.md) for TEE integration timeline.
