# Testing Guide

## Running Tests

### Full Suite

```bash
# Recommended: runs all 21 tests with local validator
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
    ✓ Initializes the game state (XXXms)
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
      ✓ Rejects unauthorized settle
      ✓ Rejects unauthorized expire
      ✓ Rejects settle with wrong treasury
    Adversarial -- double-action attacks
      ✓ Rejects double settle (replay attack)
      ✓ Rejects double expire (replay attack)
      ✓ Rejects expire on settled round
      ✓ Rejects deposit on expired round
    Adversarial -- payout manipulation
      ✓ Rejects evidence overpay
      ✓ Rejects evidence wallet/amount count mismatch
    Adversarial -- round ID manipulation
      ✓ Rejects skipping round IDs
      ✓ Rejects duplicate round ID

  21 passing
```

## Test Architecture

### Setup

The test file at `tests/alons-box.ts` sets up:

```typescript
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.AlonsBox as Program<AlonsBox>;

// Authority = provider wallet (payer)
const authority = provider.wallet;

// Generated keypairs for test accounts
const treasuryKeypair = Keypair.generate();
const buybackKeypair = Keypair.generate();
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

Each player receives a 10 SOL airdrop from the local validator before tests begin.

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
```

### Test Flow

Tests are stateful and sequential -- each test builds on the state from previous tests:

```
initialize → creates GameState + Vault
    │
    ├─ create_round(1) → Round 1 Active
    │   ├─ deposit(player1, 0.3)
    │   ├─ deposit(player2, 0.2)
    │   ├─ deposit(player3, 0.1)
    │   └─ settle(round 1) → Round 1 Settled, rollover in vault
    │
    ├─ create_round(2) → Round 2 Active (with rollover)
    │   ├─ deposit(player1, 0.5)
    │   └─ expire(round 2) → Round 2 Expired
    │
    ├─ error cases (use existing settled/expired rounds)
    │
    ├─ create_round(3) → Round 3 Active (for auth attack tests)
    │   ├─ unauthorized settle attempt → rejected
    │   ├─ unauthorized expire attempt → rejected
    │   └─ wrong treasury settle attempt → rejected
    │
    ├─ create_round(4) → Round 4 Active (for payout manipulation tests)
    │   ├─ evidence overpay attempt → rejected
    │   └─ evidence mismatch attempt → rejected
    │
    └─ round ID manipulation tests
        ├─ create_round(99) → rejected (skipping)
        └─ create_round(1) → rejected (duplicate)
```

## Test Coverage

### Summary

```
21 tests total
├── 1  Initialization
├── 4  Round 1: Settle flow (core path)
├── 3  Round 2: Expire flow (core path)
├── 3  Error cases (basic rejection)
├── 3  Authorization attacks
├── 4  Double-action / replay attacks
├── 2  Payout manipulation
└── 2  Round ID manipulation
```

### Core Flow Tests (8 tests)

#### Initialization

**"Initializes the game state"**
- Calls `initialize` with treasury and buyback wallet pubkeys
- Verifies: authority set correctly, treasury set, buyback wallet set, `current_round_id == 0`

#### Round 1: Settle Flow

**"Creates round 1"**
- Creates round with `round_id: 1`, commit hash, and deadline
- Verifies: round_id, commit_hash, ends_at, status = Active, total_deposits = 0

**"Player 1 deposits 0.3 SOL"**
- Player 1 deposits 300,000,000 lamports
- Verifies: deposit.amount, round.total_deposits

**"Player 2 and Player 3 deposit"**
- Player 2 deposits 0.2 SOL, Player 3 deposits 0.1 SOL
- Verifies: cumulative total_deposits = 0.6 SOL

**"Settles round 1"**
- Reveals answer and salt, distributes payouts
- Verifies: status = Settled, revealed_answer, revealed_salt
- Verifies exact balance changes: 50% to winner, evidence to player 2, 5% to treasury

#### Round 2: Expire Flow

**"Creates round 2 with rollover"**
- Creates round 2, verifies `rollover_in > 0` (from round 1's 15% rollover)

**"Player 1 deposits 0.5 SOL"**
- Deposits into round 2

**"Expires round 2"**
- Reveals answer and salt with no winner
- Verifies: status = Expired, revealed_answer, revealed_salt
- Verifies: 47.5% to buyback wallet, 5% to treasury, remaining in vault

### Adversarial Tests (13 tests)

#### Error Cases (3 tests)

**"Rejects unauthorized create_round"**
- A non-authority keypair attempts to create a round
- Expected: `Unauthorized` (6000)

**"Rejects settle with wrong hash"**
- Authority attempts to settle with incorrect answer/salt ("wrong"/"wrong")
- Expected: `InvalidCommitHash` (6002)

**"Rejects deposit on settled round"**
- Player attempts to deposit into round 1 (status: Settled)
- Expected: `RoundNotActive` (6001)

#### Authorization Attacks (3 tests)

**"Rejects unauthorized settle"**
- An attacker keypair attempts to settle an active round, directing the winner payout to themselves
- Expected: `Unauthorized` (6000)
- Validates that attackers cannot intercept payouts by settling rounds they don't control

**"Rejects unauthorized expire"**
- An attacker keypair attempts to expire an active round
- Expected: `Unauthorized` (6000)

**"Rejects settle with wrong treasury"**
- Authority attempts to settle but provides a fake treasury address instead of the real one
- Expected: `Unauthorized` (6000)
- Validates treasury address is checked against `GameState.treasury`, preventing fee redirection

#### Double-Action / Replay Attacks (4 tests)

**"Rejects double settle (replay attack)"**
- Authority attempts to settle round 1 again (already Settled)
- Expected: `RoundNotActive` (6001)
- Validates that settled rounds cannot be re-settled to extract additional funds

**"Rejects double expire (replay attack)"**
- Authority attempts to expire round 2 again (already Expired)
- Expected: `RoundNotActive` (6001)

**"Rejects expire on settled round"**
- Authority attempts to expire round 1 (which was settled, not expired)
- Expected: `RoundNotActive` (6001)
- Validates cross-status transitions are blocked

**"Rejects deposit on expired round"**
- Player attempts to deposit into round 2 (status: Expired)
- Expected: `RoundNotActive` (6001)

#### Payout Manipulation (2 tests)

**"Rejects evidence overpay"**
- Creates round 4, deposits 1 SOL
- Attempts to settle with `evidence_amount = pool * 3000 / 10000 + 1` (one lamport over 30%)
- Expected: `InvalidPayoutSum` (6003)
- Validates the 30% evidence cap is strictly enforced

**"Rejects evidence wallet/amount count mismatch"**
- Provides 2 evidence amounts but only 1 remaining account
- Expected: `EvidenceMismatch` (6007)
- Prevents array indexing attacks

#### Round ID Manipulation (2 tests)

**"Rejects skipping round IDs"**
- Attempts to create round 99 when next valid is round 5
- Expected: `InvalidRoundId` (6008)

**"Rejects duplicate round ID"**
- Attempts to re-create round 1 (already exists)
- Expected: Anchor constraint error (PDA already initialized)

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

## Test Environment

- **Validator:** Local Solana test validator (started automatically by `anchor test`)
- **Accounts:** Generated keypairs (authority = provider wallet, 3 player keypairs)
- **Funding:** 10 SOL airdropped to each player keypair
- **Timeout:** 1,000,000ms (extended for validator startup)

## Troubleshooting

### Tests hang on startup

The local validator may take time to start. The timeout is set to 1,000,000ms. If tests still hang, check that no other validator is running:

```bash
pkill solana-test-validator
```

### "Account not found" errors

Ensure tests run in order. Since tests are stateful, running a single test in isolation may fail due to missing prerequisite state.

### Airdrop failures

The local validator has a limited SOL supply. If airdrops fail, restart the validator:

```bash
anchor test --skip-build
```

This creates a fresh validator instance.
