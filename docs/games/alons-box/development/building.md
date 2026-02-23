# Building

## Prerequisites

### Rust

Install via [rustup](https://rustup.rs/):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Solana CLI

Install the Solana tool suite (v1.18+):

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

Verify installation:

```bash
solana --version
```

### Anchor CLI

Install Anchor v0.30.1:

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
```

Verify:

```bash
anchor --version
# anchor-cli 0.30.1
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

## Generate the IDL

The IDL (Interface Description Language) is a JSON file describing the program's interface. Due to an `anchor-syn` compatibility issue with Anchor 0.30.x, a manual generation script is used:

```bash
node generate_idl.js
```

This produces:
- `target/idl/alons_box.json` -- IDL consumed by client libraries
- `target/types/alons_box.ts` -- TypeScript type definitions

### Why a Custom IDL Generator?

Anchor 0.30.x has a known issue where `anchor build` fails to generate the IDL from source code due to a dependency on `anchor-syn`. The `generate_idl.js` script manually constructs the IDL by:

1. Computing instruction discriminators using `SHA-256("global:instruction_name")` (first 8 bytes)
2. Computing account discriminators using `SHA-256("account:AccountName")` (first 8 bytes)
3. Defining all instruction arguments, account fields, and type definitions
4. Writing the JSON and TypeScript output files

The generated IDL is functionally identical to what Anchor would produce.

## Dependencies

### Rust Dependencies

Managed by Cargo, installed automatically during build:

| Crate | Version | Purpose |
|-------|---------|---------|
| `anchor-lang` | 0.30.1 | Solana framework (with `init-if-needed` feature) |
| `blake3` | >=1.3.1, <1.8 | Build dependency (pinned at 1.5.5 in workspace) |

### Node Dependencies

```bash
npm install
```

| Package | Version | Purpose |
|---------|---------|---------|
| `@coral-xyz/anchor` | ^0.30.1 | TypeScript client library |
| `ts-mocha` | ^10.0.0 | TypeScript test runner |
| `mocha` | ^9.0.3 | Test framework |
| `chai` | ^4.3.4 | Assertion library |
| `typescript` | ^4.3.5 | TypeScript compiler |
| `prettier` | ^2.6.2 | Code formatter |

## Quick Test

Run the full test suite (21 tests). This automatically starts a local validator:

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
| `programs/alons-box/src/lib.rs` | Program entry point with 5 instruction declarations |
| `programs/alons-box/src/state.rs` | Account structs: GameState, Round, Deposit, Vault |
| `programs/alons-box/src/errors.rs` | Custom error enum with 9 error codes |
| `programs/alons-box/src/instructions/` | Instruction handler modules |
| `generate_idl.js` | Manual IDL generator script |

## Project Structure

```
simulation-contracts/
├── programs/alons-box/src/   # Rust smart contract
│   ├── lib.rs                # Entry point + instruction declarations
│   ├── state.rs              # Account data structures
│   ├── errors.rs             # Custom error codes
│   └── instructions/         # Instruction handler modules
├── tests/
│   └── alons-box.ts          # Full test suite (21 tests)
├── target/
│   ├── deploy/               # Compiled .so binary
│   ├── idl/                  # Generated IDL JSON
│   └── types/                # Generated TypeScript types
├── generate_idl.js           # IDL generation script
├── Anchor.toml               # Anchor config
├── Cargo.toml                # Rust workspace config
└── package.json              # Node dependencies
```
