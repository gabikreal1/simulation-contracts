# AI Systems

SSE uses two distinct AI roles: the **AI Architect** (creates scenarios) and the **AI Judge** (resolves outcomes). These roles are shared infrastructure -- each game configures them with game-specific prompts and criteria.

---

## AI Architect (Briefing Generator)

### Purpose

Generate high-quality synthetic scenarios for betting + player interaction.

### Output Format

Each round briefing contains:

1. **World Context** (short setting)
2. **Conflict** (what's at stake)
3. **Sides / Outcomes** (e.g., Green vs Pink, or a hidden answer)
4. **Judgment Criteria** (how the AI will evaluate)
5. **Round Duration**
6. **Round ID / Timestamp**

### Event Design Rules

Events must be:

- fictional/synthetic,
- concise but evocative,
- arguable from multiple perspectives,
- culturally neutral enough for broad participation,
- safe from legal/defamation issues.

Avoid:

- real political claims,
- unresolved real-world tragedies,
- direct real-person accusations,
- vague outcomes with no decision axis.

### Human-Created Events (Future)

In addition to AI-generated briefings, SSE may allow **users to propose and publish events**.

Flow:
- User submits event proposal (world context, conflict, sides, criteria)
- Proposal is reviewed by AI safety filters + optional community validation
- Approved events enter the SSE pool and run like any other round

---

## AI Judge (Verdict Engine)

This is the trust-critical component.

### Role

The AI Judge evaluates all player inputs and determines the round outcome using:

- public system prompt,
- round-specific criteria,
- weighted consideration of arguments and/or financial coefficients.

### Key Rule

The Judge does **not** pick randomly.
The Judge must follow a reproducible logic process.

### Evaluation Inputs

- Round briefing
- All participant arguments / actions
- Side alignment
- Stake amounts (as weight, not override)
- Predefined scoring framework

### Evaluation Principles

The Judge scores each side based on:

1. **Contextual coherence** (argument fits the world/event)
2. **Logical quality** (clear reasoning, consistency)
3. **Persuasive force** (impact, framing strength)
4. **Collective narrative convergence** (did multiple arguments reinforce each other?)
5. **Stake-weighted confidence** (capital as signal, not dictator)

### Required Output

The Judge must publish:

- **Winning side** (or correct answer verification)
- **Concise rationale** (2-5 lines)
- (Future) top influential arguments

This transforms adjudication from "black box" into a transparent protocol action.

---

## Trust Guarantees

### Commitment Integrity

For games with hidden answers (e.g., Alon's Box), the AI generates the answer inside a TEE (Trusted Execution Environment) and commits its hash on-chain before any player interaction. See [Shared Contract Patterns](../development/shared-contracts.md) for the commit-reveal scheme.

### Verdict Transparency

For games with AI adjudication (e.g., SSE prediction rounds), trust comes from:

- Published adjudication prompt framework
- Stable, versioned rules
- Visible rationale every round
- Archived inputs + outputs
- Consistency over time

### Anti-Gaming Measures

Players may attempt to reverse-engineer AI preferences. Mitigations:

- Periodic tuning of evaluation criteria
- Rotating scenario types
- Versioned judge logic
