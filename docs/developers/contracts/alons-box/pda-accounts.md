# PDA Accounts

## Overview

All on-chain state is stored in Program Derived Addresses (PDAs). PDAs are deterministic -- anyone can compute the address from the seeds and program ID. This makes account verification trustless and transparent.

## Account Map

```
Program: J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa
│
├── GameState  ["game_state"]
│   Global singleton. Stores authority, treasury, round counter.
│
├── Vault  ["vault"]
│   Global singleton. Holds all deposited SOL.
│
├── Round  ["round", round_id]
│   One per round. Stores commit hash, status, deposits.
│   Round 1: ["round", 0x0100000000000000]
│   Round 2: ["round", 0x0200000000000000]
│   ...
│
└── Deposit  ["deposit", round_id, user_pubkey]
    One per (round, player) pair. Tracks individual deposits.
```

## GameState

**Seeds:** `["game_state"]`
**Size:** 121 bytes (8 discriminator + 113 data)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `authority` | `Pubkey` | 32 | Backend wallet that controls rounds |
| `treasury` | `Pubkey` | 32 | Wallet receiving the 5% protocol fee |
| `buyback_wallet` | `Pubkey` | 32 | Wallet receiving funds on expire |
| `current_round_id` | `u64` | 8 | Counter tracking the latest round |
| `bump` | `u8` | 1 | PDA bump seed |
| `rollover_balance` | `u64` | 8 | Explicit rollover balance (lamports) |

**Created by:** `initialize` (once, ever)
**Modified by:** `create_round` (increments `current_round_id`), `settle` (updates `rollover_balance`), `expire` (updates `rollover_balance`), `emergency_expire` (updates `rollover_balance`)

### Deriving the Address

```typescript
const [gameStatePDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("game_state")],
  programId
);
```

## Vault

**Seeds:** `["vault"]`
**Size:** 9 bytes (8 discriminator + 1 data)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `bump` | `u8` | 1 | PDA bump seed |

The Vault is a minimal account -- its purpose is to hold SOL via its lamport balance, not to store data. The Vault's lamport balance equals `GameState.rollover_balance + rent_exempt_minimum` plus any active-round deposits not yet settled/expired.

Rollover is tracked explicitly in `GameState.rollover_balance`, not derived from the Vault's lamport balance. Unsolicited SOL transfers to the Vault PDA are ignored by the game math.

**Created by:** `initialize` (once, ever)
**Lamports modified by:** `deposit` (increases), `settle` (decreases), `expire` (decreases), `emergency_expire` (decreases)

### Deriving the Address

```typescript
const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  programId
);
```

## Round

**Seeds:** `["round", round_id as u64 LE bytes]`
**Size:** 242 bytes (8 discriminator + 234 data)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `round_id` | `u64` | 8 | Sequential identifier |
| `commit_hash` | `[u8; 32]` | 32 | SHA-256(answer:salt) |
| `authority` | `Pubkey` | 32 | Round creator (must match GameState.authority) |
| `ends_at` | `i64` | 8 | Unix timestamp deadline |
| `status` | `RoundStatus` | 1 | Active / Settled / Expired |
| `total_deposits` | `u64` | 8 | Sum of all player deposits in this round |
| `rollover_in` | `u64` | 8 | SOL inherited from the previous round |
| `revealed_answer` | `String` | 4 + 64 | Plaintext answer (set on settle/expire) |
| `revealed_salt` | `String` | 4 + 64 | Plaintext salt (set on settle/expire) |
| `bump` | `u8` | 1 | PDA bump seed |

**Status Enum:**

```rust
pub enum RoundStatus {
    Active,   // 0 -- Accepting deposits
    Settled,  // 1 -- Winner paid, round closed
    Expired,  // 2 -- No winner, funds distributed
}
```

**Created by:** `create_round`
**Modified by:** `deposit` (total_deposits), `settle` (status, revealed_answer, revealed_salt), `expire` (status, revealed_answer, revealed_salt), `emergency_expire` (status)
**Closed by:** `close_round` (recovers rent to authority)

### Deriving the Address

```typescript
const roundIdBuffer = Buffer.alloc(8);
roundIdBuffer.writeBigUInt64LE(BigInt(roundId));

const [roundPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("round"), roundIdBuffer],
  programId
);
```

## Deposit

**Seeds:** `["deposit", round_id as u64 LE bytes, user_pubkey]`
**Size:** 57 bytes (8 discriminator + 49 data)

| Field | Type | Size | Description |
|-------|------|------|-------------|
| `round_id` | `u64` | 8 | Which round this deposit belongs to |
| `user` | `Pubkey` | 32 | Player who deposited |
| `amount` | `u64` | 8 | Cumulative SOL deposited (in lamports) |
| `bump` | `u8` | 1 | PDA bump seed |

The Deposit account uses `init_if_needed` -- it is created on the player's first deposit into a round, and subsequent deposits to the same round accumulate into the existing account.

**Created by:** `deposit` (first deposit)
**Modified by:** `deposit` (subsequent deposits, amount incremented)
**Closed by:** `close_deposit` (recovers rent to authority)

### Deriving the Address

```typescript
const roundIdBuffer = Buffer.alloc(8);
roundIdBuffer.writeBigUInt64LE(BigInt(roundId));

const [depositPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("deposit"), roundIdBuffer, userPublicKey.toBuffer()],
  programId
);
```

## Rent Exemption

All PDAs are rent-exempt. The `initialize` instruction funds the GameState and Vault accounts, `create_round` funds the Round account, and `deposit` funds the Deposit account. Rent-exempt minimums are handled automatically by Anchor's `init` and `init_if_needed` constraints.

Rollover is tracked explicitly in `GameState.rollover_balance`. At round creation, the rollover is read directly from the game state rather than computed from the vault balance:

```
round.rollover_in = game_state.rollover_balance
```

After settle or expire, `game_state.rollover_balance` is updated to the new residual value. This ensures the vault balance always equals `rollover_balance + rent + active_deposits`.
