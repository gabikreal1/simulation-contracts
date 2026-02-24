# Shared Contract Patterns

On-chain patterns used across all games in the SSE ecosystem.

## PDA Vault Escrow

Every game uses a Program Derived Address (PDA) as a trustless escrow:

```
Player SOL ──deposit──→ Vault PDA ──settlement──→ Recipients
```

- The Vault PDA is owned by the program, not any wallet
- No external entity can withdraw funds outside of program logic
- All payouts are computed and distributed atomically in a single transaction

```rust
#[account(
    seeds = [b"vault"],
    bump,
)]
pub vault: SystemAccount<'info>,
```

## Sequential Round Management

Rounds are identified by sequential `u64` IDs. The contract enforces `round_id == current_round_id + 1`.

This prevents:

- **Round ID skipping** — to manipulate rollover amounts
- **Duplicate round creation** — PDA already exists, Anchor rejects
- **Replay attacks** — settled/expired rounds reject further operations

## Commit-Reveal Scheme

For games with hidden information (secret answers), the commit-reveal pattern provides integrity:

1. **Commit** — Authority publishes `SHA-256(secret:salt)` on-chain
2. **Play** — Players interact with the round (deposits, guesses)
3. **Reveal** — Authority reveals plaintext secret + salt
4. **Verify** — Contract recomputes hash and verifies match

The hash is stored immutably before any player interaction. The authority cannot change the secret after seeing player actions.

See [Alon's Box Commit-Reveal](alons-box/commit-reveal.md) for the full implementation.

## Fee Routing

All games route settlement funds through a consistent structure:

```
Settlement Pool
    ├── Game-specific payouts (winners, contributors)
    ├── Treasury (protocol fee)
    ├── Buyback wallet ($SIMULATION token support)
    └── Rollover (next round prize pool seed)
```

| Destination | Wallet Source | Purpose |
|-------------|-------------|---------|
| Treasury | `GameState.treasury` | Protocol revenue |
| Buyback | `GameState.buyback_wallet` | $SIMULATION token buyback |
| Rollover | Stays in Vault PDA | Next round's starting pool |

Exact percentages vary per game. See [Fee Structure](../../protocol/fee-structure.md).

## Overflow Protection

All arithmetic uses checked operations:

```rust
let payout = pool
    .checked_mul(bps as u64)
    .ok_or(GameError::MathOverflow)?
    .checked_div(10_000)
    .ok_or(GameError::MathOverflow)?;
```

The workspace `Cargo.toml` also enables `overflow-checks = true` for release builds.

## Authority Isolation

Each game has a designated authority (backend wallet) that can create rounds and trigger settlement/expiry.

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
