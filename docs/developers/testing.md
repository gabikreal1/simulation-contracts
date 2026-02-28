# Testing Guide

## Running Tests

### Full Suite

```bash
# Recommended: runs all 128 tests with local validator
anchor test --skip-build

# Via npm
npm test

# Direct ts-mocha
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

The `--skip-build` flag is used because the program binary is pre-built. Anchor automatically starts and stops a local validator for the test run.

### Expected Output

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
    ...

  rollover-accounting
    IDL & account checks
      ✓ T001 GameState SIZE matches IDL
      ✓ T002 rolloverBalance initializes correctly
      ✓ T003 RoundSettled event includes rolloverOut
      ✓ T004 RoundExpired event includes rolloverOut
    Settle math
      ✓ T005 winner receives 50% of pool
      ...
    Expire math
      ✓ T014 buyback receives 47.5% of deposits only
      ...
    ...

  128 passing
```

## Test Architecture

### Two Test Files

The test suite is split across two files that share a single local validator:

| File | Tests | Focus |
|------|-------|-------|
| `tests/alons-box.ts` | 22 | Core flow, basic adversarial |
| `tests/rollover-accounting.ts` | 106 | Rollover math, balance consistency, rounding, multi-round, deep adversarial |

Both files share the same program state — `rollover-accounting.ts` detects whether `GameState` was already initialized by the first test file and syncs its round counter and treasury/buyback pubkeys from on-chain state.

### Setup

```typescript
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.AlonsBox as Program<AlonsBox>;

// Authority = provider wallet (payer)
const authority = provider.wallet;

// Generated keypairs for test accounts
const player1 = Keypair.generate();
const player2 = Keypair.generate();
const player3 = Keypair.generate();

// PDAs
const [gameStatePDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("game_state")],
  program.programId
);
const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  program.programId
);
```

Each player receives airdropped SOL from the local validator before tests begin. The `rollover-accounting.ts` file adds mid-test re-airdrops before heavy balance-consistency sections.

### Helper Functions

```typescript
// Compute SHA-256 commit hash
function computeCommitHash(answer: string, salt: string): Buffer {
  const input = `${answer}:${salt}`;
  return crypto.createHash("sha256").update(input).digest();
}

// Derive Round PDA
function getRoundPDA(roundId: number): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buf],
    program.programId
  );
}

// Derive Deposit PDA
function getDepositPDA(roundId: number, user: PublicKey): [PublicKey, number] {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deposit"), buf, user.toBuffer()],
    program.programId
  );
}

// Vault balance consistency check (rollover-accounting.ts)
async function assertVaultConsistency() {
  const vaultBal = await provider.connection.getBalance(vaultPDA);
  const gs = await program.account.gameState.fetch(gameStatePDA);
  const rent = await provider.connection.getMinimumBalanceForRentExemption(9);
  expect(vaultBal).to.equal(
    gs.rolloverBalance.toNumber() + rent + vaultSurplus
  );
}
```

## Test Coverage

### Summary

```
128 tests total
├──  22  alons-box.ts (core flow + basic adversarial)
└── 106  rollover-accounting.ts
     ├──  4  IDL & account checks
     ├──  9  Settle math (balance verification)
     ├──  6  Expire math (deposits-only verification)
     ├──  9  Rounding dust (odd amounts, 1 lamport, primes)
     ├──  4  Multi-round accumulation (5-round chains)
     ├──  6  Emergency expire (timing, math, edge cases)
     ├──  8  Authorization attacks
     ├──  7  Double-action / replay attacks
     ├──  5  Payout manipulation
     ├──  7  Commit hash attacks
     ├──  3  Round ID manipulation
     ├──  8  Close instructions
     ├──  9  Balance consistency
     ├──  4  Deposit edge cases
     ├──  4  Rollover preservation invariants
     ├──  3  Event emission
     └── 10  Additional edge cases
```

### Core Flow Tests (alons-box.ts)

- **Initialization** — Sets up GameState and Vault, verifies authority, treasury, buyback, `current_round_id == 0`
- **Settle flow** — Creates round, deposits from 3 players, settles with winner + evidence, verifies exact balance changes
- **Expire flow** — Creates round with rollover, deposits, expires, verifies payouts from deposits only
- **Error cases** — Unauthorized create_round, wrong commit hash, deposit on settled round
- **Auth attacks** — Unauthorized settle/expire, fake treasury
- **Replay attacks** — Double settle, double expire, cross-status transitions
- **Payout manipulation** — Evidence overpay, wallet/amount mismatch
- **Round ID manipulation** — Skip IDs, duplicate IDs
- **Emergency expire** — Permissionless expiry after 24hr grace, timing enforcement
- **Account closing** — close_deposit and close_round after settlement

### Rollover Accounting Tests (rollover-accounting.ts)

#### IDL & Account Checks (T001-T004)
Validates GameState SIZE matches the IDL, `rolloverBalance` field exists and initializes correctly, and settlement/expiry events include `rolloverOut`.

#### Settle Math (T005-T013)
Verifies exact lamport-level payouts: 50% winner, evidence amounts, 5% treasury, residual rollover. Checks `game_state.rollover_balance` updates correctly. Tests with varying evidence allocations (0%, 15%, max 30%).

#### Expire Math (T014-T019)
Verifies buyback receives 47.5% of **deposits only**, treasury receives 5% of deposits, and previous rollover is fully preserved. Validates `rollover_out = rollover_in + rollover_added`.

#### Rounding Dust (T020-T028)
Tests with amounts that produce non-trivial rounding: odd lamports, 1-lamport deposits, prime numbers (e.g., 999,999,937 lamports). Verifies vault balance consistency after every operation — no lamports lost to integer division.

#### Multi-Round Accumulation (T029-T032)
Runs 5-round chains with alternating settle/expire patterns. Verifies rollover compounds correctly across rounds and vault balance matches `rollover_balance + rent` after cleanup.

#### Emergency Expire (T033-T038)
Tests permissionless expiry timing (rejects before 24hr, succeeds after), validates deposits-only math is identical to regular expire, and verifies rollover preservation.

#### Adversarial Tests (T039-T068)
- **Auth attacks** — Non-authority settle/expire, fake treasury, fake buyback wallet, attacker as winner
- **Double actions** — Re-settle, re-expire, cross-status transitions, deposit on closed rounds
- **Payout manipulation** — Evidence over 30% cap, wallet/amount count mismatch, zero-amount evidence
- **Commit hash attacks** — Wrong answer, wrong salt, swapped answer/salt, empty strings, near-miss answers
- **Round ID** — Skip IDs, reuse IDs, future IDs

#### Close Instructions (T069-T076)
Tests close_deposit and close_round after both settle and expire. Verifies rent recovery, prevents closing active rounds, and validates round_id matching on deposits.

#### Balance Consistency (T077-T085)
End-to-end vault consistency checks across full settle and expire flows. Verifies `vault_lamports == rollover_balance + rent + vaultSurplus` at every stage: after round creation, after deposits, after settlement/expiry.

#### Deposit Edge Cases (T086-T089)
Multiple deposits from same player (accumulation), large deposits (20 SOL), multiple players in same round.

#### Rollover Preservation (T090-T093)
Multi-round sequences verifying that expire preserves previous rollover completely, and settle computes rollover as the correct residual.

#### Event Emission (T094-T096)
Verifies RoundSettled, RoundExpired, and EmergencyExpired events contain correct `rolloverOut` values by checking on-chain state matches expected post-event values.

#### Additional Edge Cases (T097-T106)
Settle with zero evidence, vault consistency pre/post settle, immediate round creation after settle, maximum evidence cap (exactly 30%), and combined multi-instruction flows.

## Writing New Tests

### Pattern

```typescript
it("Description of what the test validates", async () => {
  // Setup: compute PDAs, prepare parameters
  const [roundPDA] = getRoundPDA(roundId);
  const commitHash = computeCommitHash(answer, salt);

  // Execute
  await program.methods
    .instructionName(arg1, arg2)
    .accounts({
      account1: address1,
      account2: address2,
    })
    .signers([keypair]) // if not the provider wallet
    .rpc();

  // Assert
  const account = await program.account.round.fetch(roundPDA);
  expect(account.status).to.deep.equal({ active: {} });
});
```

### Testing Error Cases

```typescript
it("Rejects invalid operation", async () => {
  try {
    await program.methods
      .invalidOperation()
      .accounts({ ... })
      .rpc();
    expect.fail("Should have thrown");
  } catch (err) {
    expect(err.error.errorCode.number).to.equal(6000); // Unauthorized
  }
});
```

### Verifying Balance Changes

```typescript
// Capture balances before
const balanceBefore = await provider.connection.getBalance(wallet);

// Execute instruction
await program.methods.settle(...).rpc();

// Check balance after
const balanceAfter = await provider.connection.getBalance(wallet);
const expectedPayout = Math.floor(pool * 5000 / 10000); // 50%
expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
```

### Vault Consistency Check

```typescript
// After settle or expire, verify vault balance matches explicit tracking
const vaultBal = await provider.connection.getBalance(vaultPDA);
const gs = await program.account.gameState.fetch(gameStatePDA);
const rent = await provider.connection.getMinimumBalanceForRentExemption(9);
expect(vaultBal).to.equal(gs.rolloverBalance.toNumber() + rent);
```

## Test Environment

- **Validator:** Local Solana test validator (started automatically by `anchor test`)
- **Accounts:** Generated keypairs (authority = provider wallet, 3 player keypairs per file)
- **Funding:** SOL airdropped to each player keypair, with mid-test re-airdrops for heavy sections
- **Timeout:** 1,000,000ms (extended for validator startup)

## Troubleshooting

### Tests hang on startup

The local validator may take time to start. The timeout is set to 1,000,000ms. If tests still hang, check that no other validator is running:

```bash
pkill solana-test-validator
```

### "Account not found" errors

Ensure tests run in order. Since tests are stateful, running a single test in isolation may fail due to missing prerequisite state.

### "Account already in use" errors

Both test files share a single validator. The `rollover-accounting.ts` file handles this by checking if `GameState` already exists before calling `initialize`. If you see this error, ensure the `before` hook properly detects existing state.

### Airdrop failures

The local validator has a limited SOL supply. If airdrops fail, restart the validator:

```bash
anchor test --skip-build
```

This creates a fresh validator instance.

### Insufficient funds during tests

Heavy test sections (balance consistency, large deposits) may exhaust player balances. The test suite includes mid-test re-airdrops before these sections. If a specific test fails with insufficient funds, add an airdrop in the `before` hook of the relevant `describe` block.
