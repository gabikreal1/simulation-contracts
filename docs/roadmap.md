# Roadmap

## Vision

Alon's Box aims to become a verifiable, trustless crypto-AI game where critical components are provably fair through hardware-attested execution. The current contract handles fund escrow and commitment verification on-chain, with answers cryptographically committed before deposits. The roadmap moves AI inference into Trusted Execution Environments (TEEs), providing cryptographic attestation that the correct code ran without tampering.

---

## Phase 1: Foundation (Completed)

**On-chain escrow with commit-reveal verification**

- [x] Anchor smart contract with 5 instructions
- [x] Commit-reveal scheme (SHA-256)
- [x] PDA escrow (Vault) with deterministic payouts
- [x] Sequential round management with rollover
- [x] Evidence distribution with 30% cap
- [x] 21 tests (8 core + 13 adversarial)
- [x] Devnet deployment
- [x] IDL generation and TypeScript types

---

## Phase 2: TEE Execution Environment

**Move AI inference into a Trusted Execution Environment**

TEE integration adds hardware-attested guarantees to AI answer generation. By running the AI model inside a secure enclave, the entire answer lifecycle -- from generation to commitment -- is cryptographically verifiable.

### What is TEE?

A Trusted Execution Environment (TEE) is a secure area within a processor that guarantees code and data are protected in terms of confidentiality and integrity. The two leading TEE technologies for this use case:

- **Intel SGX / TDX** -- Hardware enclaves with remote attestation
- **AMD SEV-SNP** -- Confidential VMs with cryptographic proof of execution

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  TEE Enclave                     │
│                                                  │
│  1. Generate answer using AI model               │
│  2. Generate random salt                         │
│  3. Compute SHA-256(answer:salt)                 │
│  4. Sign commit_hash with enclave key            │
│  5. Store answer securely until reveal            │
│                                                  │
│  Attestation: cryptographic proof that this      │
│  code ran inside a genuine TEE, unmodified       │
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

- [ ] TEE enclave running the AI inference model
- [ ] Remote attestation verification (on-chain or via oracle)
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

## Phase 3: Decentralized Oracle Network

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

## Phase 4: Protocol Maturity

**Production readiness and ecosystem features**

- [ ] Mainnet deployment with security audit
- [ ] Program freeze (immutable after audit)
- [ ] Multi-token support (SPL tokens alongside SOL)
- [ ] Variable round configurations (different BPS splits per round type)
- [ ] On-chain deadline enforcement (clock-based expiry)
- [ ] Player statistics tracking (on-chain or via indexer)
- [ ] SDK and developer documentation for third-party integrations
- [ ] Governance token and DAO structure

---

## Phase 5: Cross-Chain Expansion

**Extend the protocol to other chains**

- [ ] EVM implementation (Solidity) for Ethereum L2s
- [ ] Cross-chain bridging for unified prize pools
- [ ] Chain-agnostic TEE attestation
- [ ] Universal player identity (cross-chain deposits)

---

## Timeline

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | On-chain escrow + commit-reveal | Completed |
| Phase 2 | TEE execution environment | Next |
| Phase 3 | Decentralized oracle network | Planned |
| Phase 4 | Protocol maturity + mainnet | Planned |
| Phase 5 | Cross-chain expansion | Future |

---

## Contributing

Interested in contributing to the protocol's development? Key areas where we need help:

- **TEE Integration** -- Experience with Intel SGX/TDX or AMD SEV-SNP
- **Security Auditing** -- Review of contract logic and test coverage
- **Frontend Development** -- Building the player-facing application
- **DevOps** -- CI/CD, monitoring, and infrastructure
