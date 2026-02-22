# Instructions Reference

## Overview

The program exposes 5 instructions. Three are authority-only (`create_round`, `settle`, `expire`), one is public (`deposit`), and one is a one-time setup (`initialize`).

```
initialize  ──→  create_round  ──→  deposit  ──→  settle
                                                    or
                                                   expire
```

---

## `initialize`

Sets up the global game state and vault. Called once at program deployment.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `treasury` | `Pubkey` | Wallet to receive the 5% protocol fee |
| `buyback_wallet` | `Pubkey` | Wallet to receive funds on round expiry |

### Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `authority` | Yes | Yes | Backend wallet, becomes the game authority |
| `game_state` | Yes | No | PDA to be initialized `["game_state"]` |
| `vault` | Yes | No | PDA to be initialized `["vault"]` |
| `system_program` | No | No | Solana System Program |

### Behavior

1. Initializes `GameState` PDA with:
   - `authority` = signer
   - `treasury` = provided treasury pubkey
   - `buyback_wallet` = provided buyback pubkey
   - `current_round_id` = 0
2. Initializes `Vault` PDA (empty, holds SOL via lamport balance)

### Errors

None specific -- will fail if PDAs already exist (can only be called once).

### Example

```typescript
await program.methods
  .initialize(treasuryPubkey, buybackPubkey)
  .accounts({
    authority: wallet.publicKey,
    gameState: gameStatePDA,
    vault: vaultPDA,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

---

## `create_round`

Opens a new round with a committed answer hash. Authority-only.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `round_id` | `u64` | Must equal `current_round_id + 1` |
| `commit_hash` | `[u8; 32]` | SHA-256 of `"answer:salt"` |
| `ends_at` | `i64` | Unix timestamp for round deadline |

### Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `authority` | Yes | Yes | Must match `GameState.authority` |
| `game_state` | Yes | No | Global state (round counter updated) |
| `round` | Yes | No | PDA to be initialized `["round", round_id]` |
| `vault` | No | No | Read-only, used to calculate rollover |
| `system_program` | No | No | Solana System Program |

### Behavior

1. Validates caller is the authority
2. Validates `round_id == game_state.current_round_id + 1`
3. Calculates rollover: `vault_lamports - rent_exempt_minimum`
4. Initializes Round PDA with:
   - `status` = Active
   - `commit_hash` = provided hash
   - `total_deposits` = 0
   - `rollover_in` = calculated rollover
5. Increments `game_state.current_round_id`

### Errors

| Code | Name | Condition |
|------|------|-----------|
| 6000 | `Unauthorized` | Caller is not the authority |
| 6008 | `InvalidRoundId` | round_id != current_round_id + 1 |

### Example

```typescript
const answer = "red apple";
const salt = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const commitHash = computeCommitHash(answer, salt);
const endsAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour

await program.methods
  .createRound(new BN(1), Array.from(commitHash), new BN(endsAt))
  .accounts({
    authority: wallet.publicKey,
    gameState: gameStatePDA,
    round: roundPDA,
    vault: vaultPDA,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

---

## `deposit`

Deposits SOL into an active round. Any player can call this.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `amount` | `u64` | Lamports to deposit |

### Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `player` | Yes | Yes | Player depositing SOL |
| `round` | Yes | No | Must be Active status |
| `deposit` | Yes | No | PDA `["deposit", round_id, player]` (init_if_needed) |
| `vault` | Yes | No | Receives the SOL |
| `system_program` | No | No | Solana System Program |

### Behavior

1. Validates `round.status == Active`
2. Transfers `amount` lamports from player to Vault via CPI
3. Creates or updates the Deposit PDA:
   - First deposit: initializes with `amount`
   - Subsequent deposits: `deposit.amount += amount` (checked_add)
4. Updates `round.total_deposits += amount` (checked_add)

### Errors

| Code | Name | Condition |
|------|------|-----------|
| 6001 | `RoundNotActive` | Round status is not Active |
| 6004 | `MathOverflow` | Arithmetic overflow on accumulation |

### Example

```typescript
const depositAmount = new BN(0.3 * LAMPORTS_PER_SOL);

await program.methods
  .deposit(depositAmount)
  .accounts({
    player: playerKeypair.publicKey,
    round: roundPDA,
    deposit: depositPDA,
    vault: vaultPDA,
    systemProgram: SystemProgram.programId,
  })
  .signers([playerKeypair])
  .rpc();
```

---

## `settle`

Resolves a round with a winner. Authority-only. Reveals the answer, verifies the commit hash, and distributes payouts.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `answer` | `String` | Plaintext answer (max 64 bytes) |
| `salt` | `String` | Plaintext salt (max 64 bytes) |
| `evidence_amounts` | `Vec<u64>` | Lamport amounts for each evidence wallet |

### Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `authority` | Yes | Yes | Must match `GameState.authority` |
| `game_state` | No | No | Used to validate treasury address |
| `round` | Yes | No | Must be Active status |
| `vault` | Yes | No | Source of payouts |
| `winner` | Yes | No | Receives 50% of pool |
| `treasury` | Yes | No | Receives 5%, must match `GameState.treasury` |
| `system_program` | No | No | Solana System Program |

**Remaining Accounts:** Evidence wallets (writable), one per entry in `evidence_amounts`.

### Behavior

1. Validates caller is the authority
2. Validates answer length <= 64 bytes
3. Validates salt length <= 64 bytes
4. Computes `SHA-256(answer:salt)` and verifies against `round.commit_hash`
5. Validates `evidence_amounts.len() == remaining_accounts.len()`
6. Calculates pool: `round.total_deposits + round.rollover_in`
7. Validates `sum(evidence_amounts) <= pool * 3000 / 10000` (30% cap)
8. Validates treasury matches `game_state.treasury`
9. Distributes from Vault PDA:
   - 50% (5000 BPS) to winner
   - Evidence amounts to remaining accounts
   - 5% (500 BPS) to treasury
   - 15% (1500 BPS) stays in vault as rollover
10. Sets `round.status = Settled`
11. Stores `revealed_answer` and `revealed_salt`

### Errors

| Code | Name | Condition |
|------|------|-----------|
| 6000 | `Unauthorized` | Caller is not the authority, or treasury mismatch |
| 6001 | `RoundNotActive` | Round already settled or expired |
| 6002 | `InvalidCommitHash` | SHA-256 verification failed |
| 6003 | `InvalidPayoutSum` | Evidence amounts exceed 30% cap |
| 6005 | `AnswerTooLong` | Answer exceeds 64 bytes |
| 6006 | `SaltTooLong` | Salt exceeds 64 bytes |
| 6007 | `EvidenceMismatch` | Wallet count != amount count |

### Example

```typescript
await program.methods
  .settle("red apple", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", [evidenceAmount])
  .accounts({
    authority: wallet.publicKey,
    gameState: gameStatePDA,
    round: roundPDA,
    vault: vaultPDA,
    winner: winnerPubkey,
    treasury: treasuryPubkey,
    systemProgram: SystemProgram.programId,
  })
  .remainingAccounts([
    { pubkey: evidenceWallet, isWritable: true, isSigner: false },
  ])
  .rpc();
```

---

## `expire`

Ends a round with no winner. Authority-only. Reveals the answer, verifies the commit hash, and distributes funds for buyback/rollover.

### Parameters

| Name | Type | Description |
|------|------|-------------|
| `answer` | `String` | Plaintext answer (max 64 bytes) |
| `salt` | `String` | Plaintext salt (max 64 bytes) |

### Accounts

| Account | Writable | Signer | Description |
|---------|----------|--------|-------------|
| `authority` | Yes | Yes | Must match `GameState.authority` |
| `game_state` | No | No | Used to validate treasury/buyback addresses |
| `round` | Yes | No | Must be Active status |
| `vault` | Yes | No | Source of payouts |
| `treasury` | Yes | No | Receives 5% |
| `buyback_wallet` | Yes | No | Receives 47.5% |

### Behavior

1. Validates caller is the authority
2. Validates answer and salt lengths
3. Computes `SHA-256(answer:salt)` and verifies against `round.commit_hash`
4. Calculates pool: `round.total_deposits + round.rollover_in`
5. Distributes from Vault PDA:
   - 47.5% (4750 BPS) to buyback wallet
   - 5% (500 BPS) to treasury
   - 47.5% stays in vault as rollover
6. Sets `round.status = Expired`
7. Stores `revealed_answer` and `revealed_salt`

### Errors

| Code | Name | Condition |
|------|------|-----------|
| 6000 | `Unauthorized` | Caller is not the authority |
| 6001 | `RoundNotActive` | Round already settled or expired |
| 6002 | `InvalidCommitHash` | SHA-256 verification failed |
| 6005 | `AnswerTooLong` | Answer exceeds 64 bytes |
| 6006 | `SaltTooLong` | Salt exceeds 64 bytes |

### Example

```typescript
await program.methods
  .expire("blue chair", "f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6")
  .accounts({
    authority: wallet.publicKey,
    gameState: gameStatePDA,
    round: roundPDA,
    vault: vaultPDA,
    treasury: treasuryPubkey,
    buybackWallet: buybackPubkey,
  })
  .rpc();
```
