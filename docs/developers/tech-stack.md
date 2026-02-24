# Tech Stack

## Blockchain

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Chain | Solana | — | Sub-second finality, low fees, PDA support |
| Smart Contract Framework | Anchor | 0.31.1 | Type-safe development, account validation |
| Contract Language | Rust | Stable | On-chain program logic |
| Runtime | Solana BPF | — | Berkeley Packet Filter bytecode execution |

## Cryptography

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Commitment Scheme | SHA-256 | Commit-reveal for answer integrity |
| Account Derivation | PDA (Program Derived Addresses) | Deterministic, trustless account management |

## Development Tools

| Component | Technology | Version |
|-----------|-----------|---------|
| Rust Toolchain | rustup | Latest stable |
| Solana CLI | Solana Tool Suite | v2.0+ |
| Anchor CLI | Anchor | v0.31.1 |
| Node.js | Node | v18+ |

## Testing

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Test Runner | ts-mocha | TypeScript test execution |
| Test Framework | Mocha | Test organization |
| Assertions | Chai | Expect-style assertions |
| Local Validator | solana-test-validator | Local Solana network for tests |
| Formatter | Prettier 2.6.2 | Code style consistency |

## AI Services (Planned)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| LLM Hosting | Phala Network (TEE) | Hardware-attested AI inference |
| TEE Framework | Intel TDX + dstack | Confidential compute, remote attestation |

## Frontend (Planned)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Wallet Integration | Solana Wallet Adapter | Connect player wallets |
| Client Library | @coral-xyz/anchor | TypeScript program interaction |
