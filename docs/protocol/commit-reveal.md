# Commit-Reveal Scheme

## Overview

The commit-reveal scheme is the core trust mechanism in Alon's Box. It guarantees that the answer to each round is fixed before any player deposits SOL, making it impossible for the backend to change the answer after seeing player activity.

## How It Works

### Phase 1: Commit

Before creating a round, the backend:

1. Generates a secret **answer** (e.g., `"red apple"`)
2. Generates a random **salt** (e.g., `"a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"`)
3. Computes the commit hash: `SHA-256("red apple:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")`
4. Calls `create_round` with the 32-byte hash

The hash is stored immutably in the Round PDA. The plaintext answer and salt remain secret.

```
commit_hash = SHA-256("answer:salt")
            = SHA-256("red apple:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
            = [32-byte hash stored on-chain]
```

### Phase 2: Play

Players deposit SOL into the round. The committed hash is publicly visible on-chain, but without the salt, it's computationally infeasible to reverse the hash and discover the answer.

### Phase 3: Reveal

When the round ends, the backend calls `settle` or `expire` with the plaintext answer and salt. The contract:

1. Validates answer length (max 64 bytes)
2. Validates salt length (max 64 bytes)
3. Reconstructs the hash: `SHA-256("answer:salt")`
4. Compares against the stored `commit_hash`
5. If mismatch: **transaction fails** with `InvalidCommitHash` error
6. If match: proceeds with payout distribution

```rust
// On-chain verification (pseudocode)
let revealed = format!("{}:{}", answer, salt);
let computed = sha256(revealed.as_bytes());
require!(computed == round.commit_hash, InvalidCommitHash);
```

## Security Properties

### Answer Immutability

Once `create_round` is confirmed, the commit hash is stored in a PDA. It cannot be modified by any subsequent instruction. The only instructions that reference it (`settle`, `expire`) only **read** it for verification.

### Pre-image Resistance

SHA-256 is a cryptographic hash function. Given only the hash, it is computationally infeasible to determine the original answer+salt input. This means:

- Players cannot derive the answer from the on-chain hash
- The salt adds entropy even if the answer space is small
- Each round uses a unique salt, so hash values are never reused

### Binding Property

The backend **must** reveal the exact answer and salt that produce the committed hash. If the backend tries to claim a different answer, the hash won't match and the transaction will revert. This is the fundamental fairness guarantee.

### Non-repudiation

After settlement, both the answer and salt are stored on-chain in the Round PDA (`revealed_answer`, `revealed_salt`). Anyone can independently verify:

```
SHA-256(revealed_answer + ":" + revealed_salt) == commit_hash
```

## Implementation Details

### Hash Computation (Off-Chain)

The backend and test suite compute the commit hash using Node.js:

```typescript
import * as crypto from "crypto";

function computeCommitHash(answer: string, salt: string): Buffer {
  const input = `${answer}:${salt}`;
  return crypto.createHash("sha256").update(input).digest();
}
```

### Hash Verification (On-Chain)

The Rust contract uses Solana's `hash` module (SHA-256) to verify:

```rust
use anchor_lang::solana_program::hash::hash;

let input = format!("{}:{}", answer, salt);
let computed = hash(input.as_bytes());
require!(
    computed.to_bytes() == round.commit_hash,
    GameError::InvalidCommitHash
);
```

### Constraints

| Parameter | Max Length | Error if Exceeded |
|-----------|-----------|-------------------|
| `answer` | 64 bytes | `AnswerTooLong` (6005) |
| `salt` | 64 bytes | `SaltTooLong` (6006) |

## Trust Model

| Question | Answer |
|----------|--------|
| Can the backend change the answer after deposits? | No. The hash is immutable once committed. |
| Can players discover the answer from the hash? | No. SHA-256 pre-image resistance prevents this. |
| Can the backend claim a different answer at settlement? | No. Hash verification will fail. |
| Can anyone verify the result after settlement? | Yes. The revealed answer and salt are stored on-chain. |
| Does the backend know the answer during the round? | Yes, but it cannot profit from this -- payouts go to the winner. |
