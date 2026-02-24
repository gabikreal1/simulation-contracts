# Building

## Prerequisites

### Rust

Install via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Solana CLI

Install the Solana tool suite (v2.0+):

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

Verify installation:

```bash
solana --version
```

### Anchor CLI

Install Anchor v0.31.1:

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1
```

Verify:

```bash
anchor --version
# anchor-cli 0.31.1
```

### Node.js

Install Node.js v18+ from [nodejs.org](https://nodejs.org/) or via nvm:

```bash
nvm install 18
nvm use 18
```

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd simulation-contracts
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure Solana CLI

For local development (testing):

```bash
solana config set --url localhost
```

For devnet:

```bash
solana config set --url devnet
```

### 4. Generate a keypair (if you don't have one)

```bash
solana-keygen new -o ~/.config/solana/id.json
```

For devnet, airdrop some SOL:

```bash
solana airdrop 5
```

## Build the On-Chain Program

The Solana program compiles to BPF (Berkeley Packet Filter) bytecode:

```bash
cargo build-sbf --manifest-path programs/alons-box/Cargo.toml --sbf-out-dir target/deploy
```

This produces:
- `target/deploy/alons_box.so` -- The compiled program binary (deployed to Solana)
- `target/deploy/alons_box-keypair.json` -- Program keypair (contains the program ID)

### Build Configuration

The workspace `Cargo.toml` enables safety and optimization settings:

```toml
[profile.release]
overflow-checks = true    # Panic on integer overflow (matches checked_add)
lto = "fat"               # Maximum link-time optimization
codegen-units = 1         # Single codegen unit for best optimization
```

## Build with Anchor

Anchor 0.31.1 handles building the program and generating the IDL in a single command:

```bash
anchor build
```

This produces:
- `target/deploy/alons_box.so` -- The compiled program binary
- `target/idl/alons_box.json` -- IDL consumed by client libraries
- `target/types/alons_box.ts` -- TypeScript type definitions

## Dependencies

### Rust Dependencies

Managed by Cargo, installed automatically during build:

| Crate | Version | Purpose |
|-------|---------|---------|
| `anchor-lang` | 0.31.1 | Solana framework (with `init-if-needed` feature) |
| `blake3` | >=1.3.1, <1.8 | Build dependency (pinned at 1.5.5 in workspace) |

### Node Dependencies

```bash
npm install
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@coral-xyz/anchor` | ^0.31.1 | TypeScript client library |
| `ts-mocha` | ^10.0.0 | TypeScript test runner |
| `mocha` | ^9.0.3 | Test framework |
| `chai` | ^4.3.4 | Assertion library |
| `typescript` | ^4.3.5 | TypeScript compiler |
| `prettier` | ^2.6.2 | Code formatter |

## Quick Test

Run the full test suite (29 tests). This automatically starts a local validator:

```bash
anchor test --skip-build
```

Or via npm:

```bash
npm test
```

See the [Testing Guide](testing.md) for detailed test coverage information.

## Quick Deploy

See the [Deployment Guide](deployment.md) for full instructions.

```bash
solana config set --url devnet
solana program deploy target/deploy/alons_box.so
```

## Formatting

Check formatting:

```bash
npm run lint
```

Auto-fix formatting:

```bash
npm run lint:fix
```

Uses Prettier 2.6.2 with default configuration.

## Source Files

| File | Description |
|------|-------------|
| `programs/alons-box/src/lib.rs` | Program entry point with 8 instruction declarations |
| `programs/alons-box/src/state.rs` | Account structs: GameState, Round, Deposit, Vault |
| `programs/alons-box/src/errors.rs` | Custom error enum with 12 error codes |
| `programs/alons-box/src/events.rs` | On-chain event definitions |
| `programs/alons-box/src/utils.rs` | Shared helpers (vault transfers) |
| `programs/alons-box/src/instructions/` | Instruction handler modules (8 instructions) |

## Project Structure

```
simulation-contracts/
├── programs/alons-box/src/   # Rust smart contract
│   ├── lib.rs                # Entry point + 8 instruction declarations
│   ├── state.rs              # Account data structures
│   ├── errors.rs             # Custom error codes (6000-6011)
│   ├── events.rs             # On-chain event definitions
│   ├── utils.rs              # Shared helpers (vault transfers)
│   └── instructions/         # Instruction handler modules
├── tests/
│   └── alons-box.ts          # Full test suite (29 tests)
├── target/
│   ├── deploy/               # Compiled .so binary
│   ├── idl/                  # Generated IDL JSON
│   └── types/                # Generated TypeScript types
├── Anchor.toml               # Anchor config
├── Cargo.toml                # Rust workspace config
└── package.json              # Node dependencies
```
