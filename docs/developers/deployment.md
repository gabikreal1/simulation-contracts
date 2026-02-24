# Deployment

## Current Deployment

The program is deployed on **Solana Devnet**:

```
Program ID: J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa
Network:    Devnet
```

Explorer: [View on Solana Explorer](https://explorer.solana.com/address/J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa?cluster=devnet)

## Prerequisites

- Solana CLI installed and configured
- Sufficient SOL in your deployer wallet (program deployment costs ~2-5 SOL depending on program size)
- Built program binary at `target/deploy/alons_box.so`

## Deploy to Devnet

### 1. Configure Solana CLI for Devnet

```bash
solana config set --url devnet
```

Verify:

```bash
solana config get
# Config File: ~/.config/solana/cli/config.yml
# RPC URL: https://api.devnet.solana.com
# Commitment: confirmed
```

### 2. Fund your wallet

```bash
# Check balance
solana balance

# Airdrop SOL (devnet only, max 5 SOL per request)
solana airdrop 5
```

### 3. Build the program

```bash
anchor build
```

### 4. Deploy

```bash
solana program deploy target/deploy/alons_box.so
```

On success, this outputs the program ID and deployment transaction signature.

### 5. Initialize the program

After deployment, call `initialize` once to set up the GameState and Vault PDAs:

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AlonsBox } from "../target/types/alons_box";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.AlonsBox as Program<AlonsBox>;

const [gameStatePDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("game_state")],
  program.programId
);
const [vaultPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")],
  program.programId
);

await program.methods
  .initialize(treasuryPubkey, buybackPubkey)
  .accounts({
    authority: provider.wallet.publicKey,
    gameState: gameStatePDA,
    vault: vaultPDA,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

## Deploy to Mainnet

### Additional considerations for mainnet:

1. **Audit** -- Get the contract audited by a reputable security firm before mainnet deployment
2. **Multisig** -- Consider using a multisig for the program upgrade authority
3. **Freeze authority** -- Consider freezing the program to make it immutable after deployment
4. **Program keypair** -- Ensure the program keypair is stored securely

### Steps

```bash
# Switch to mainnet
solana config set --url mainnet-beta

# Ensure sufficient SOL for deployment
solana balance

# Deploy
solana program deploy target/deploy/alons_box.so
```

### Post-deployment verification

```bash
# Verify the deployed program
solana program show <PROGRAM_ID>

# Check program data
solana account <PROGRAM_ID>
```

## Program Upgrades

By default, Anchor programs are upgradeable. The upgrade authority (deployer wallet) can deploy new versions:

```bash
# Deploy an upgrade
solana program deploy target/deploy/alons_box.so --program-id <PROGRAM_ID>
```

### Making the program immutable

To permanently disable upgrades:

```bash
solana program set-upgrade-authority <PROGRAM_ID> --final
```

**Warning:** This is irreversible. The program can never be upgraded again.

## Environment Variables

For backend integration, set the program ID:

```bash
export ESCROW_PROGRAM_ID=J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa
```

## Anchor.toml Configuration

```toml
[programs.devnet]
alons_box = "J5LMxDvUSz5Agbo3bjpJZN17p4BNfqGNbrhU5vqNYrEa"

[provider]
cluster = "localnet"  # For tests; change to devnet/mainnet-beta for deployments
wallet = "~/.config/solana/id.json"
```
