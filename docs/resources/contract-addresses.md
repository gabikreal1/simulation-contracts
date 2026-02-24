# Contract Addresses

## Alon's Box

| Field | Value |
|-------|-------|
| Program ID | `J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa` |
| Network | Solana Devnet |
| Explorer | [View on Solana Explorer](https://explorer.solana.com/address/J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa?cluster=devnet) |

## PDA Accounts

All accounts are derived deterministically from the program ID:

| Account | Seeds | Purpose |
|---------|-------|---------|
| GameState | `["game_state"]` | Global config: authority, treasury, round counter |
| Vault | `["vault"]` | Singleton SOL escrow |
| Round | `["round", round_id]` | Per-round state |
| Deposit | `["deposit", round_id, user_pubkey]` | Per-user deposit tracking |

See [PDA Accounts](../developers/contracts/alons-box/pda-accounts.md) for full derivation details and field layouts.
