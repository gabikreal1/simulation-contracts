# Error Codes

## Reference Table

| Code | Name | Message | Triggered By |
|------|------|---------|--------------|
| 6000 | `Unauthorized` | Unauthorized: caller is not the authority | `create_round`, `settle`, `expire` |
| 6001 | `RoundNotActive` | Round is not active | `deposit`, `settle`, `expire` |
| 6002 | `InvalidCommitHash` | Invalid commit hash: SHA-256 mismatch | `settle`, `expire` |
| 6003 | `InvalidPayoutSum` | Invalid payout sum: evidence amounts exceed 30% pool | `settle` |
| 6004 | `MathOverflow` | Math overflow | `deposit`, `settle`, `expire` |
| 6005 | `AnswerTooLong` | Answer too long (max 64 bytes) | `settle`, `expire` |
| 6006 | `SaltTooLong` | Salt too long (max 64 bytes) | `settle`, `expire` |
| 6007 | `EvidenceMismatch` | Evidence wallets count != evidence amounts count | `settle` |
| 6008 | `InvalidRoundId` | Invalid round ID | `create_round` |
| 6009 | `RoundStillActive` | Round is still active | `close_deposit`, `close_round` |
| 6010 | `GracePeriodNotElapsed` | Emergency grace period has not elapsed (24 hours after ends_at) | `emergency_expire` |
| 6011 | `InvalidEndTime` | Invalid end time: must be in the future | `create_round` |

## Detailed Descriptions

### 6000 -- Unauthorized

The transaction signer is not the designated authority stored in `GameState.authority`. This error also triggers when the treasury account provided to `settle` does not match `GameState.treasury`.

**Common causes:**
- Calling `create_round`, `settle`, or `expire` from a wallet other than the authority
- Passing an incorrect treasury address to `settle`

### 6001 -- RoundNotActive

The target round's status is not `Active`. Only active rounds accept deposits and can be settled or expired. Once a round transitions to `Settled` or `Expired`, it is permanently closed.

**Common causes:**
- Attempting to deposit into a settled or expired round
- Attempting to settle/expire a round that was already settled/expired (replay attack)
- Attempting to expire a settled round or vice versa

### 6002 -- InvalidCommitHash

The SHA-256 hash of the provided `answer:salt` does not match the `commit_hash` stored in the Round PDA. This is the core security check of the commit-reveal scheme.

**Common causes:**
- Providing the wrong answer or salt
- Typo in the answer string
- Using a different salt than what was committed

### 6003 -- InvalidPayoutSum

The sum of all `evidence_amounts` exceeds 30% of the total pool. The evidence cap is enforced to prevent draining the prize pool through inflated evidence payouts.

**Formula:** `sum(evidence_amounts) > pool * 3000 / 10000`

### 6004 -- MathOverflow

An arithmetic operation (`checked_add` or `checked_mul`) would overflow a `u64`. This is a safety check rather than an expected error condition.

### 6005 -- AnswerTooLong

The `answer` string exceeds 64 bytes. The Round PDA allocates a fixed 64-byte buffer for the revealed answer.

### 6006 -- SaltTooLong

The `salt` string exceeds 64 bytes. The Round PDA allocates a fixed 64-byte buffer for the revealed salt.

### 6007 -- EvidenceMismatch

The number of entries in `evidence_amounts` does not match the number of remaining accounts provided to `settle`. Each evidence amount must correspond to exactly one evidence wallet.

### 6008 -- InvalidRoundId

The provided `round_id` does not equal `game_state.current_round_id + 1`. Rounds must be created sequentially with no gaps.

**Common causes:**
- Attempting to skip round IDs (e.g., creating round 5 when next should be 3)
- Attempting to re-create an existing round ID

### 6009 -- RoundStillActive

The target round's status is still `Active`. The `close_deposit` and `close_round` instructions can only be called after a round has been settled or expired.

**Common causes:**
- Attempting to close a deposit or round PDA before the round has been resolved

### 6010 -- GracePeriodNotElapsed

The 24-hour emergency grace period has not yet elapsed. `emergency_expire` can only be called when the current time is more than 24 hours after the round's `ends_at` timestamp.

**Common causes:**
- Calling `emergency_expire` too early (before `ends_at + 86400` seconds)

### 6011 -- InvalidEndTime

The `ends_at` timestamp provided to `create_round` is not in the future. Rounds must have a deadline that is after the current clock time.

**Common causes:**
- Passing a past or current timestamp as `ends_at`

## Anchor Framework Errors

In addition to custom errors, Anchor may return its own errors for account constraint violations:

| Condition | Error |
|-----------|-------|
| PDA already initialized | `AccountAlreadyInUse` |
| Incorrect PDA seeds | `ConstraintSeeds` |
| Missing signer | `ConstraintSigner` |
| Insufficient lamports | `InsufficientFunds` |

## Error Handling in TypeScript

```typescript
import { AnchorError } from "@coral-xyz/anchor";

try {
  await program.methods.settle(...).rpc();
} catch (err) {
  if (err instanceof AnchorError) {
    console.log("Error code:", err.error.errorCode.number); // e.g., 6002
    console.log("Error name:", err.error.errorCode.code);   // e.g., "InvalidCommitHash"
    console.log("Error msg:", err.error.errorMessage);
  }
}
```
