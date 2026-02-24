# AI Systems

SSE uses two AI roles: the **AI Architect** generates scenarios, and the **AI Judge** resolves outcomes. These are shared infrastructure — each game configures them with game-specific prompts.

## AI Architect

The AI Architect generates the content for each round.

### What It Produces

Each round briefing contains:

1. **World Context** — short setting description
2. **Conflict** — what's at stake
3. **Sides / Outcomes** — e.g., Green vs Pink, or a hidden answer
4. **Judgment Criteria** — how the AI will evaluate
5. **Round Duration**
6. **Round ID / Timestamp**

### Constraints

Generated events must be:

- Fictional / synthetic (no real-world claims)
- Arguable from multiple perspectives
- Culturally neutral for broad participation
- Free of legal / defamation risk
- Concise with a clear decision axis

### Per-Game Behavior

| Game | AI Architect Role |
|------|------------------|
| Alon's Box | Generates a two-word hidden phrase from a constrained vocabulary |
| SSE Prediction Rounds | Generates a synthetic conflict scenario with two sides |

## AI Judge

The AI Judge evaluates all player inputs and determines the round outcome.

### Evaluation Inputs

- Round briefing (the scenario)
- All participant arguments / actions
- Side alignment
- Stake amounts (as weight signal, not override)
- Predefined scoring framework

### Scoring Criteria

The Judge scores each side based on:

1. **Contextual coherence** — argument fits the scenario
2. **Logical quality** — clear reasoning, internal consistency
3. **Persuasive force** — impact and framing strength
4. **Collective convergence** — did multiple arguments reinforce each other?
5. **Stake-weighted confidence** — capital as signal, not dictator

Stake influences weight, but weak logic can lose. This is enforced by design.

### Required Output

Every verdict includes:

- **Winning side** (or correct answer verification)
- **Rationale** (2–5 lines explaining the decision)

### Per-Game Behavior

| Game | AI Judge Role |
|------|--------------|
| Alon's Box | Not used — resolution is cryptographic (commit-reveal hash verification) |
| SSE Prediction Rounds | Evaluates arguments, publishes verdict and rationale |

## Anti-Gaming Measures

Players may attempt to reverse-engineer AI preferences. Mitigations:

- Periodic tuning of evaluation criteria
- Rotating scenario types via [Realms](../games/alons-box/realms.md)
- Versioned judge logic with published changelogs
- Future: TEE attestation for verifiable inference (see [Trust Model](trust-model.md))
