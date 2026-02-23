# Shared Contract Patterns

This document describes the on-chain patterns shared across all games in the SSE ecosystem.

## PDA Vault Escrow

Every game uses a Program Derived Address (PDA) as a trustless escrow:

```
Player SOL ──deposit──→ Vault PDA ──settlement──→ Recipients
```

- The Vault PDA is owned by the program, not any wallet
- No external entity can withdraw funds outside of program logic
- All payouts are computed and distributed atomically within a single transaction

### Pattern

```rust
// Vault PDA derivation
#[account(
    seeds = [b"vault"],
    bump,
)]
pub vault: SystemAccount<'info>,
```

## Sequential Round Management

Games enforce strict round ordering to prevent manipulation:

- Rounds are identified by sequential `u64` IDs
- Round N+1 can only be created after Round N exists
- Contract enforces `round_id == current_round_id + 1`

This prevents:
- Round ID skipping (to manipulate rollover)
- Duplicate round creation
- Replay attacks on settled/expired rounds

## Commit-Reveal Scheme

For games requiring hidden information (like secret answers), the commit-reveal pattern provides integrity:

1. **Commit**: Authority publishes `SHA-256(secret:salt)` on-chain
2. **Play**: Players interact with the round (deposits, guesses, etc.)
3. **Reveal**: Authority reveals plaintext secret + salt
4. **Verify**: Contract recomputes hash and verifies match

The hash is stored immutably on-chain before any player interaction, ensuring the authority cannot change the secret after seeing player actions.

## Fee Routing

All games route fees through a consistent structure:

```
Settlement Pool
    ├── Game-specific payouts (winners, contributors)
    ├── Treasury (protocol fee)
    ├── Buyback wallet ($SIMULATION token support)
    └── Rollover (next round prize pool seed)
```

The exact percentages vary per game, but the routing destinations are shared:

| Destination | Wallet Source | Purpose |
|-------------|-------------|---------|
| Treasury | `GameState.treasury` | Protocol revenue |
| Buyback | `GameState.buyback_wallet` | $SIMULATION token buyback |
| Rollover | Stays in Vault PDA | Next round's starting pool |

## Overflow Protection

All arithmetic in on-chain programs uses checked operations:

```rust
let payout = pool
    .checked_mul(bps as u64)
    .ok_or(GameError::MathOverflow)?
    .checked_div(10_000)
    .ok_or(GameError::MathOverflow)?;
```

This prevents integer overflow/underflow exploits across all games.

## Authority Isolation

Each game has a designated authority (backend wallet) that can:
- Create rounds
- Trigger settlement/expiry

The authority **cannot**:
- Withdraw funds directly from the vault
- Change treasury/buyback addresses after initialization
- Settle rounds with mismatched commit hashes

Authority checks are enforced at the constraint level:

```rust
#[account(
    constraint = game_state.authority == authority.key() @ GameError::Unauthorized
)]
pub authority: Signer<'info>,
```
