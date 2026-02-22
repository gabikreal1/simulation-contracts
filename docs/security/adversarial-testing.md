# Adversarial Testing

## Test Suite Overview

The project includes 21 tests covering both happy-path flows and adversarial scenarios. Tests run against a local Solana validator using `anchor test`.

```
21 tests total
├── 1  Initialization
├── 4  Round 1: Settle flow (core path)
├── 3  Round 2: Expire flow (core path)
├── 3  Error cases (basic rejection)
├── 3  Authorization attacks
├── 4  Double-action / replay attacks
├── 2  Payout manipulation
└── 2  Round ID manipulation  (1 unused; see note)
```

## Core Flow Tests (8 tests)

### Initialization

**"Initializes the game state"**
- Calls `initialize` with treasury and buyback wallet pubkeys
- Verifies: authority set correctly, treasury set, buyback wallet set, `current_round_id == 0`

### Round 1: Settle Flow

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

### Round 2: Expire Flow

**"Creates round 2 with rollover"**
- Creates round 2, verifies `rollover_in > 0` (from round 1's 15% rollover)

**"Player 1 deposits 0.5 SOL"**
- Deposits into round 2

**"Expires round 2"**
- Reveals answer and salt with no winner
- Verifies: status = Expired, revealed_answer, revealed_salt
- Verifies: 47.5% to buyback wallet, 5% to treasury, remaining in vault

## Error Case Tests (3 tests)

**"Rejects unauthorized create_round"**
- A non-authority keypair attempts to create a round
- Expected: `Unauthorized` (6000)

**"Rejects settle with wrong hash"**
- Authority attempts to settle with incorrect answer/salt ("wrong"/"wrong")
- Expected: `InvalidCommitHash` (6002)

**"Rejects deposit on settled round"**
- Player attempts to deposit into round 1 (status: Settled)
- Expected: `RoundNotActive` (6001)

## Adversarial: Authorization Attacks (3 tests)

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

## Adversarial: Double-Action Attacks (4 tests)

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

## Adversarial: Payout Manipulation (2 tests)

**"Rejects evidence overpay"**
- Creates round 4, deposits 1 SOL
- Attempts to settle with `evidence_amount = pool * 3000 / 10000 + 1` (one lamport over 30%)
- Expected: `InvalidPayoutSum` (6003)
- Validates the 30% evidence cap is strictly enforced

**"Rejects evidence wallet/amount count mismatch"**
- Provides 2 evidence amounts but only 1 remaining account
- Expected: `EvidenceMismatch` (6007)
- Prevents array indexing attacks

## Adversarial: Round ID Manipulation (2 tests)

**"Rejects skipping round IDs"**
- Attempts to create round 99 when next valid is round 5
- Expected: `InvalidRoundId` (6008)

**"Rejects duplicate round ID"**
- Attempts to re-create round 1 (already exists)
- Expected: Anchor constraint error (PDA already initialized)

## Running Tests

```bash
# Full suite with local validator
anchor test --skip-build

# Via npm
npm test

# Direct ts-mocha execution
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

## Test Environment

- **Validator:** Local Solana test validator (started automatically by `anchor test`)
- **Accounts:** Generated keypairs (authority = provider wallet, 3 player keypairs)
- **Funding:** 10 SOL airdropped to each player keypair
- **Timeout:** 1,000,000ms (extended for validator startup)
