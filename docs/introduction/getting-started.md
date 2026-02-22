# Getting Started

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

## Build

Build the on-chain BPF program:

```bash
cargo build-sbf --manifest-path programs/alons-box/Cargo.toml --sbf-out-dir target/deploy
```

Generate the IDL (Interface Description Language):

```bash
node generate_idl.js
```

This produces:
- `target/idl/alons_box.json` -- IDL for client integration
- `target/types/alons_box.ts` -- TypeScript type definitions

## Test

Run the full test suite (21 tests). This automatically starts a local validator:

```bash
anchor test --skip-build
```

Or via npm:

```bash
npm test
```

Expected output:

```
  alons-box
    ✓ Initializes the game state
    Round 1 -- settle flow
      ✓ Creates round 1
      ✓ Player 1 deposits 0.3 SOL
      ✓ Player 2 and Player 3 deposit
      ✓ Settles round 1
    Round 2 -- expire flow
      ✓ Creates round 2 with rollover
      ✓ Player 1 deposits 0.5 SOL
      ✓ Expires round 2
    Error cases
      ✓ Rejects unauthorized create_round
      ✓ Rejects settle with wrong hash
      ✓ Rejects deposit on settled round
    Adversarial -- authorization attacks
      ...
    21 passing
```

## Deploy

See the [Deployment Guide](../developers/deployment.md) for full instructions.

Quick deploy to devnet:

```bash
solana config set --url devnet
solana program deploy target/deploy/alons_box.so
```

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
