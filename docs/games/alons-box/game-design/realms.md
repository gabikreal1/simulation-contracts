# Realms for Alon's Box

> Status: Coming Soon -- not required for MVP

---

## Concept

**Realms** are themed versions of Alon's Box where the AI's hidden items are restricted to a specific domain.

Each realm runs the same core mechanics, but with **domain-constrained vocabulary**, increasing both fairness and strategic depth.

---

## Examples

### Anime Realm

- Hidden items only from anime-related concepts
- Characters, objects, archetypes, tropes
- Non-proper-noun constrained if needed

### Finance Realm

- Market objects, instruments, concepts
- TradFi / DeFi abstractions
- Non-brand, rule-constrained

### Sports Realm

- Equipment, actions, positions
- Generic sport concepts

### Custom / Event Realms

- Community-voted themes
- Sponsored or seasonal realms
- Limited-time experimental domains

---

## Why Realms Matter for Alon's Box

- **Reduces AI ambiguity** -- smaller vocabulary = clearer Yes/No answers
- **Makes questioning more skill-based** -- domain knowledge matters
- **Encourages repeat play** across realms
- **Enables segmentation** -- casual vs expert players
- **Opens space** for events, partnerships, and content drops

---

## Implementation Notes

Realms for Alon's Box require:

1. Realm-specific word lists for the AI to draw from
2. AI system prompt modifications to constrain answers to the realm
3. UI indication of active realm
4. Realm selection in round creation

The on-chain contract does not need changes for Realms -- it's purely an AI/backend configuration. The commit-reveal scheme works identically regardless of word source.

See also: [Platform Realms](../../../platform/game-design/realms.md) for the cross-game Realms concept.
