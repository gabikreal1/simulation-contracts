# Roadmap

## Vision

The SSE platform aims to become a verifiable, trustless crypto-AI gaming ecosystem where critical components are provably fair through hardware-attested execution. The roadmap progresses from working smart contracts through TEE integration to a fully decentralized operator network, while expanding the game portfolio.

---

## Phase 0: Conceptual Prototype (Completed)

- [x] Non-functional demo
- [x] Narrative + UX proof
- [x] Product design documents (SSE + Alon's Box)

---

## Phase 1: Foundation (Completed)

**Alon's Box: On-chain escrow with commit-reveal verification**

- [x] Anchor smart contract with 8 instructions
- [x] Commit-reveal scheme (SHA-256)
- [x] PDA escrow (Vault) with deterministic payouts
- [x] Sequential round management with rollover
- [x] Evidence distribution with 30% cap
- [x] Emergency dead man's switch (permissionless after 24hr)
- [x] Account closing for rent recovery
- [x] On-chain events for monitoring
- [x] 29 tests (8 core + 21 adversarial)
- [x] Devnet deployment
- [x] IDL generation and TypeScript types

---

## Phase 2: Playable MVP (In Progress)

**SSE Prediction Rounds + Alon's Box live gameplay**

- [x] Alon's Box: playable frontend
- [x] Alon's Box: backend integration
- [x] Alon's Box: live on devnet
- [ ] Hourly synthetic rounds (SSE)
- [ ] Stake + argument injection
- [ ] AI verdict + rationale
- [ ] On-chain settlement
- [ ] Round archive

---

## Phase 2.5: Thematic Expansion

- [ ] Realm-based rounds
- [ ] Realm-specific AI Judge tuning
- [ ] Community identity formation

---

## Phase 3: TEE Execution Environment

**Move AI inference into Phala Network's TEE infrastructure**

The backend currently generates answers and commits them on-chain. With Phala, the LLM runs inside an Intel TDX confidential VM on Phala Cloud. The enclave generates the answer, computes the commit hash, and signs it with an enclave-derived key -- all hardware-attested.

### Why Phala?

[Phala Network](https://phala.network/) provides TEE-as-a-Service purpose-built for running AI workloads in confidential VMs:

- **Phala Cloud** -- Deploy containerized LLMs into Intel TDX confidential VMs with GPU passthrough
- **dstack** -- Open-source SDK for building TEE applications with built-in remote attestation and key derivation
- **Remote Attestation** -- Intel TDX attestation quotes are verifiable on-chain or via Phala's attestation oracle
- **LLM support** -- Confidential VMs can run full-size LLMs (not limited to tiny ZK-friendly models)

### Architecture

```
┌─────────────────────────────────────────────────┐
│          Phala Cloud (Intel TDX CVM)             │
│                                                  │
│  1. Load LLM inside confidential VM              │
│  2. Generate answer via AI inference             │
│  3. Generate random salt                         │
│  4. Compute SHA-256(answer:salt)                 │
│  5. Sign commit_hash with TEE-derived key        │
│  6. Store answer securely until reveal            │
│                                                  │
│  Attestation: Intel TDX quote proving code       │
│  integrity + model hash, verifiable on-chain     │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│              Solana Smart Contract               │
│                                                  │
│  - Verify TEE attestation on-chain               │
│  - Verify enclave signatures on commit/settle    │
│  - Execute payouts based on verified results     │
└─────────────────────────────────────────────────┘
```

### Deliverables

- [ ] LLM deployed on Phala Cloud in a confidential VM
- [ ] dstack integration for TEE key derivation and attestation
- [ ] Remote attestation verification (on-chain or via Phala oracle)
- [ ] Enclave-signed commit hashes (replacing backend-signed)
- [ ] Attestation report stored on-chain per round
- [ ] Open-source enclave code for community verification

### Trust Improvement

| Component | Current | With TEE |
|-----------|---------|----------|
| Answer generation | Trust the backend | Verified in enclave |
| Commit hash creation | Trust the backend | Signed by enclave |
| Answer commitment | Trustless (on-chain) | Trustless (on-chain) |
| Fund distribution | Trustless (on-chain) | Trustless (on-chain) |

---

## Phase 3.5: Enhanced Economic Layer + Human Architect

- [ ] Logic Multipliers (top influential arguments)
- [ ] Friendly Pools integration
- [ ] Advanced analytics / stake graph
- [ ] Player profiles and round history
- [ ] User-created events (curated)
- [ ] Event designer reputation

---

## Phase 4: Rich Media SSE

- [ ] "Battle Visuals" (generated images)
- [ ] Generative highlight scenes
- [ ] Event recap outputs

---

## Phase 5: Decentralized Oracle Network

**Replace single authority with a decentralized operator set**

- [ ] Multi-operator round creation (M-of-N threshold signatures)
- [ ] Decentralized attestation verification via oracle network
- [ ] Slashing conditions for misbehaving operators
- [ ] Operator staking and reward distribution
- [ ] Governance for parameter updates (BPS splits, evidence caps)

### Architecture

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│Operator 1│  │Operator 2│  │Operator 3│
│  (TEE)   │  │  (TEE)   │  │  (TEE)   │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └─────────────┼─────────────┘
                   │
            Threshold Signature
                   │
                   ▼
          ┌────────────────┐
          │ Solana Contract │
          │ (verify M-of-N) │
          └────────────────┘
```

---

## Phase 6: Agentic SSE Arena

- [ ] AI agents participate autonomously
- [ ] Bot-vs-bot / bot-vs-human events
- [ ] Strategic agent competitions
- [ ] Human-machine market experiments

---

## Ongoing

- Jackpot modifiers (high-variance special rounds)
- Synthetic stress tests of real-world dynamics
- New game launches in the SSE ecosystem

---

## Timeline

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 0 | Conceptual prototype | Completed |
| Phase 1 | On-chain escrow + commit-reveal | Completed |
| Phase 2 | Playable MVP | In Progress |
| Phase 2.5 | Thematic expansion (Realms) | Planned |
| Phase 3 | TEE execution (Phala) | Planned |
| Phase 3.5 | Enhanced economy + human architects | Planned |
| Phase 4 | Rich media SSE | Planned |
| Phase 5 | Decentralized oracle network | Planned |
| Phase 6 | Agentic SSE arena | Planned |

---

## Security

We welcome security reviews of the contract logic and test coverage.

---

## Also in Development

| Game | Description |
|------|-------------|
| **2 Pills** | Players choose between two sides, each leading to radically different simulated outcomes that test risk tolerance and belief systems |
| **Darwin Arena** | Players create a character and send them through 100 unpredictable stress events to see how long they survive and adapt under pressure |
| **Play or Exit** | Participants decide whether to continue risking their position in an unpredictable simulation or leave early and secure what they have earned |
| **Unicorn Factory** | Players build startups for an AI-generated future and compete to grow the only ideas capable of surviving into unicorn companies |
| **Alien Wants You** | Players attempt to communicate with an alien intelligence that constantly changes its expectations and chooses only a few worthy contacts |
| **Foresight Space** | Participants predict future events and explore alternative timelines where strategic foresight determines success |
| **Socratic Engine** | Humans and AI engage in structured philosophical debates where questioning, reasoning, and persuasion shape the final outcome |
