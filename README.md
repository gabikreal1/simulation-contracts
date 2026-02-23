# Alon's Box

**A trustless crypto-AI guessing game on Solana.**

<div align="center">

https://github.com/gabikreal1/simulation-contracts/raw/main/assets/walkthrough.mp4

</div>

Players deposit SOL into a program-owned escrow and compete to guess a secret answer. The answer is cryptographically committed before any deposits occur, ensuring provably fair outcomes through an on-chain commit-reveal scheme.

Built with [Anchor 0.30.1](https://www.anchor-lang.com/) | Deployed on [Solana Devnet](https://explorer.solana.com/address/FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1?cluster=devnet) | [Docs](https://simulation-theory.gitbook.io/simulation-theory-docs)

```
Program ID: FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1
```

---

## How It Works

```
Backend commits SHA-256(answer:salt)
        |
   Round opens  -->  Players deposit SOL  -->  Round closes
        |                                           |
        v                                           v
   On-chain hash verified  <--  Backend reveals answer + salt
        |
        v
   Payouts distributed automatically via PDA escrow
```

1. **Commit** -- The backend creates a round with `SHA-256(answer:salt)` locked on-chain
2. **Deposit** -- Players deposit SOL into a program-owned Vault PDA
3. **Reveal** -- The backend reveals the plaintext answer and salt
4. **Verify** -- The contract recomputes the hash and verifies it matches the original commit
5. **Payout** -- SOL is distributed automatically: 50% winner, up to 30% evidence, 5% treasury, 15% rollover

No one -- not even the backend -- can change the answer after players deposit. The hash is the proof.

---

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (stable + nightly)
- [Solana CLI](https://docs.solanalabs.com/cli/install) v1.18+
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) v0.30.1
- [Node.js](https://nodejs.org/) v18+

### Build

```bash
# Build the on-chain program
cargo build-sbf --manifest-path programs/alons-box/Cargo.toml --sbf-out-dir target/deploy

# Generate the IDL
node generate_idl.js
```

### Test

```bash
# Run all 21 tests (spins up local validator automatically)
anchor test --skip-build

# Or via npm
npm test
```

### Deploy

```bash
solana config set --url devnet
solana program deploy target/deploy/alons_box.so
```

---

## Architecture

```
                    +------------------+
                    |   Backend (Auth) |
                    +--------+---------+
                             |
              create_round / settle / expire
                             |
                             v
+----------+    deposit    +------------------+    payout    +----------+
|  Players | ----------->  |  Vault PDA       | ----------> |  Winner  |
+----------+               |  (SOL Escrow)    |             +----------+
                           +------------------+             |  Evidence|
                                                            +----------+
                                                            |  Treasury|
                                                            +----------+
```

| PDA Account | Seeds | Purpose |
|-------------|-------|---------|
| `GameState` | `["game_state"]` | Global config: authority, treasury, round counter |
| `Vault` | `["vault"]` | Singleton SOL escrow holding all deposits |
| `Round` | `["round", round_id]` | Per-round state: commit hash, status, deposits |
| `Deposit` | `["deposit", round_id, user]` | Per-user deposit tracking |

---

## Payout Distribution

### Settle (winner found)

| Recipient | Share | Description |
|-----------|-------|-------------|
| Winner | 50% | Player who guessed correctly |
| Evidence | up to 30% | Distributed to evidence providers |
| Treasury | 5% | Protocol fee |
| Rollover | 15% | Carried into the next round's prize pool |

### Expire (no winner)

| Recipient | Share | Description |
|-----------|-------|-------------|
| Buyback Wallet | 47.5% | Token buyback mechanism |
| Treasury | 5% | Protocol fee |
| Rollover | 47.5% | Carried into the next round's prize pool |

---

## Security

- **Commit-reveal scheme** -- Answer is SHA-256 hashed before deposits; verified on-chain at settlement
- **PDA escrow** -- SOL is held by the program, not any wallet. No one can withdraw without program logic
- **Sequential round IDs** -- Prevents round skipping or replay attacks
- **Evidence cap** -- Evidence payouts hard-capped at 30% to prevent drain attacks
- **Authority checks** -- Only the designated authority can create rounds, settle, or expire
- **Overflow protection** -- All arithmetic uses `checked_add` / `checked_mul`
- **21 tests** -- 8 core flow + 13 adversarial covering auth attacks, replay attacks, payout manipulation, and round ID manipulation

---

## Documentation

**[Read the full docs on GitBook](https://simulation-theory.gitbook.io/simulation-theory-docs)** | [Browse locally](./docs/SUMMARY.md)

### Platform (SSE)

- [SSE Overview](./docs/platform/overview.md)
- [Platform Architecture](./docs/platform/development/architecture.md)
- [Design Pillars](./docs/platform/game-design/design-pillars.md)
- [Token Flow](./docs/platform/tokenomics/token-flow.md)
- [Roadmap](./docs/roadmap.md)

### Alon's Box

- [Game Overview](./docs/games/alons-box/overview.md)
- [Building](./docs/games/alons-box/development/building.md)
- [Architecture](./docs/games/alons-box/development/architecture.md)
- [Commit-Reveal Scheme](./docs/games/alons-box/development/commit-reveal.md)
- [PDA Accounts](./docs/games/alons-box/development/pda-accounts.md)
- [Instructions Reference](./docs/games/alons-box/development/instructions.md)
- [Payout Distribution](./docs/games/alons-box/tokenomics/payout-distribution.md)
- [Error Codes](./docs/games/alons-box/development/error-codes.md)
- [Security Model](./docs/games/alons-box/development/security-model.md)
- [Testing Guide](./docs/games/alons-box/development/testing.md)
- [Deployment](./docs/games/alons-box/development/deployment.md)
- [Backend Integration](./docs/games/alons-box/development/integration.md)

---

## Project Structure

```
programs/alons-box/src/
  lib.rs              -- Program entry point, 5 instructions
  state.rs            -- Account structs (GameState, Round, Deposit, Vault)
  errors.rs           -- Custom error codes (6000-6008)
  instructions/       -- Instruction handler modules

tests/
  alons-box.ts        -- 21 tests (core flow + adversarial)

target/
  deploy/alons_box.so -- Compiled BPF binary
  idl/alons_box.json  -- Interface Description Language
  types/alons_box.ts  -- Generated TypeScript types

generate_idl.js       -- IDL generator (Anchor 0.30.x workaround)
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Rust + Anchor 0.30.1 |
| Runtime | Solana BPF |
| Hashing | SHA-256 (commit-reveal) |
| Testing | TypeScript + ts-mocha + Chai |
| Formatting | Prettier 2.6.2 |
| Network | Solana Devnet |

---

## License

All rights reserved.
