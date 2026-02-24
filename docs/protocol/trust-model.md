# Trust Model

SSE combines on-chain verification with AI transparency to minimize trust assumptions. This document covers what's enforced today and what's planned.

## On-Chain Guarantees

These guarantees are enforced by the smart contract — no trust in the backend required.

| Guarantee | Mechanism |
|-----------|-----------|
| Answer immutability | `SHA-256(answer:salt)` committed on-chain before any deposits |
| Fund safety | PDA escrow — no external wallet has custody |
| Payout correctness | Deterministic BPS calculation with checked arithmetic |
| Round integrity | Sequential round IDs prevent replay/skip attacks |
| Fee transparency | Treasury and buyback addresses locked at `initialize` |
| Evidence cap | Evidence payouts hard-capped at 30% of pool |

For implementation details, see [Shared Patterns](../developers/contracts/shared-patterns.md) and [Security Model](../developers/contracts/alons-box/security-model.md).

## AI Transparency

For rounds resolved by the AI Judge, trust comes from transparency:

- Published adjudication prompt framework
- Stable, versioned evaluation rules
- Visible rationale published every round
- Archived inputs and outputs for every round
- Consistency trackable across rounds

The Judge cannot pick randomly — it follows a reproducible logic process against published criteria.

## Whale Resistance

Stake influences weight, but does not guarantee a win:

- In guessing games: spending more gives more attempts, but doesn't guarantee the answer
- In prediction rounds: larger stakes add weight, but the AI Judge evaluates argument quality independently

This is a core protocol property, not a soft guideline.

## Moderation Policy

### Allowed

- Absurdity, bluffing, taunts
- Narrative threats ("AI choose us or face collapse")
- Memes, roleplay

### Blocked

- Real-world violent threats
- Doxxing
- Slurs / severe harassment
- Illegal content

If content is blocked, the player's stake remains valid. Only the message is redacted.

## TEE Roadmap

### Current State

The backend generates answers and commits them on-chain. The commit-reveal scheme proves the answer was fixed before deposits, but players must trust the backend generated the answer fairly.

### Planned: Phala Network Integration

Moving AI inference into Trusted Execution Environments (Intel TDX via Phala Network) adds hardware-level trust:

| Component | Current | With TEE |
|-----------|---------|----------|
| Answer generation | Trust the backend | Verified in enclave |
| Commit hash creation | Trust the backend | Signed by enclave key |
| Answer commitment | Trustless (on-chain) | Trustless (on-chain) |
| Fund distribution | Trustless (on-chain) | Trustless (on-chain) |

With TEE:

- The exact code and model that ran is verifiable via Intel TDX attestation
- No one, including the node operator, can observe or tamper with the inference
- Attestation reports are stored on-chain per round

See [Roadmap](../resources/roadmap.md) for the TEE integration timeline.
