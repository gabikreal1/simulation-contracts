# Platform Architecture

## Core Components

The SSE platform consists of six core components that work together to run synthetic prediction rounds:

```
┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│ Frontend App │───→│ Round Orchestrator│───→│ AI Services  │
└──────┬───────┘    └────────┬─────────┘    └──────┬───────┘
       │                     │                      │
       │                     ▼                      │
       │            ┌──────────────────┐            │
       └───────────→│ Settlement Engine│←───────────┘
                    └────────┬─────────┘
                             │
                    ┌────────┴─────────┐
                    ▼                  ▼
           ┌──────────────┐   ┌──────────────┐
           │  On-Chain     │   │ Archive Layer │
           │  Contracts    │   │              │
           └──────────────┘   └──────────────┘
```

### 1. Frontend App

- Round UI (timer, briefing, sides, pot)
- Wallet connect (Solana)
- Live feed of participant actions
- Verdict display and payout claims

### 2. Round Orchestrator

- Creates rounds (on-chain transactions)
- Manages round timers
- Locks inputs when timer expires
- Triggers verdict and settlement

### 3. AI Services

Two distinct AI roles:

- **AI Architect (Briefing Generator)** -- generates synthetic scenarios for each round
- **AI Judge (Verdict Engine)** -- evaluates participant inputs and determines outcome

See [AI Systems](../game-design/ai-systems.md) for detailed design.

### 4. Settlement Engine

- Calculates payout distributions based on game-specific rules
- Posts payouts on-chain
- Records round history
- Handles rollover mechanics

### 5. Archive Layer

- Stores complete round payloads (scenario, arguments, stakes, verdict)
- Searchable history
- Stake graph and prompt logs
- Permanent record of "how reality was written"

### 6. On-Chain Contracts

- Escrow (PDA vaults)
- Settlement (payout distribution)
- Fee routing (treasury, buyback, liquidity)
- Transparency/audit hooks

---

## Cross-Game Architecture Pattern

Every game in the SSE ecosystem follows the same high-level flow:

```
Round Creation → Player Actions → Lock → Resolution → Settlement → Archive
```

What differs per game:

| Layer | Shared | Game-Specific |
|-------|--------|---------------|
| Escrow | PDA vault pattern | Deposit structure |
| Settlement | Fee routing, rollover | Payout ratios, winner logic |
| AI | Infrastructure, model hosting | Prompts, evaluation criteria |
| Frontend | Wallet connect, base UI | Game-specific UX |

---

## Deployment Topology

```
                  ┌─────────────────┐
                  │   Solana Chain   │
                  │ (Devnet/Mainnet) │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
    ┌─────────▼──┐  ┌──────▼─────┐  ┌──▼──────────┐
    │  Game       │  │  Game      │  │  Shared      │
    │  Contract 1 │  │  Contract 2│  │  Treasury    │
    │  (Alon's)   │  │  (Future)  │  │  Contract    │
    └─────────────┘  └────────────┘  └─────────────┘
```

Each game deploys its own Solana program with game-specific logic, while sharing:

- Treasury wallet for protocol fees
- Buyback wallet for $SIMULATION token support
- Common PDA patterns (vault, round, deposit)
