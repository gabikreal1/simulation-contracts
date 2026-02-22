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
