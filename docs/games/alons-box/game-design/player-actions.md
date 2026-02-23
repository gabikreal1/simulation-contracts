# Player Actions and Economy

## Action Costs

| Action | Visibility | Cost | Information Trade-off |
|--------|-----------|------|----------------------|
| Ask question | Public | x SOL | Cheaper, but reveals information to all |
| Ask question | Private | y SOL | More expensive, but preserves your edge |
| Make guess | Public | z SOL | Cheaper, but others see your attempt |
| Make guess | Private | w SOL | More expensive, but preserves surprise |

The core strategic tradeoff:

- **Public = cheaper, but reveals information**
- **Private = more expensive, but preserves edge**

All cost variables (**x, y, z, w**) are tunable for live balancing.

---

## Player Psychology

### Urgency

Time-boxed rounds create natural pressure. As the timer counts down, the cost of inaction increases.

### FOMO

Public questions and their answers are visible to everyone. Watching others get closer to the answer creates fear of missing out and drives participation.

### Meta Strategy

The public/private dimension creates layers of strategy:

- **Free riders** can watch public questions and try to synthesize the answer
- **Strategic questioners** use private questions to build exclusive information
- **Public contributors** gain payout share if their questions received "Yes" answers
- **Late-round guessers** use accumulated public knowledge for informed attempts

### Social Drama

Public feeds create a spectator experience. Watching players ask questions, seeing Yes/No answers accumulate, and witnessing guess attempts creates natural entertainment value.

---

## Reward Structure

### Standard Win Distribution (Correct Guess)

| Recipient | Share | Description |
|-----------|-------|-------------|
| Winner | 50% | Player who guessed correctly |
| Evidence providers | up to 30% | Players who asked questions that received "Yes" answers |
| Rollover | 15% | Seeds next round's prize pool |
| Liquidity | 5% | Friendly Pools liquidity |

### Cap Distribution (No Winner, pot reaches C)

| Recipient | Share |
|-----------|-------|
| Buyback ($SIMULATION) | 47.5% |
| Rollover to next round | 47.5% |
| Treasury | 5% |

See [Payout Distribution](../tokenomics/payout-distribution.md) for exact on-chain BPS calculations.

---

## UX / Product Features (MVP)

- Real-time question/answer feed (public actions)
- Private action interface
- Round timer with visual countdown
- Prize pool tracker
- Payout claim screen
- Round history / archive

---

## Risks, Exploits, and Mitigations

| Risk | Mitigation |
|------|-----------|
| Colluding players share private info off-platform | Acceptable -- private questions still cost more |
| Brute-force guessing with many accounts | Min cost per guess, rate limiting |
| AI answer inconsistency | Commitment hash + deterministic prompts |
| Meta-gaming the AI's vocabulary | Rotating word pools, Realm constraints |

---

## Success Metrics (Live Ops)

- Average round duration
- Rounds per day
- Total SOL deposited per round
- Public vs private action ratio
- Evidence payout utilization (how close to 30% cap)
- Player retention (rounds per unique wallet)
