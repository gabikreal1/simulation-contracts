# Realms

> Status: **Coming Soon** — not required for MVP

## What Are Realms?

Realms are themed versions of Alon's Box where the AI's hidden phrases are restricted to a specific domain. Each realm runs the same core mechanics, but with a domain-constrained word pool.

## Examples

| Realm | Hidden Phrase Domain |
|-------|---------------------|
| **Anime** | Characters, objects, archetypes, tropes |
| **Finance** | Market instruments, DeFi concepts, institutions |
| **Sports** | Equipment, actions, positions |
| **Sci-Fi** | Technology, post-human concepts, AI themes |
| **Custom** | Community-voted, sponsored, or seasonal themes |

## Why Realms?

- **Smaller vocabulary** = clearer Yes/No answers from the AI
- **Domain knowledge matters** = more skill-based gameplay
- **Repeat play** across different realms
- **Community identity** = "Finance grinders," "Anime tacticians"

## Implementation

Realms are a backend configuration — no smart contract changes required:

1. Realm-specific word lists for the AI to draw from
2. AI system prompt modifications to constrain answers to the realm
3. UI indication of the active realm
4. Realm selection in round creation

The on-chain commit-reveal scheme works identically regardless of word source. The contract has no awareness of realms.
