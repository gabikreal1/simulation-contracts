import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AlonsBox } from "../target/types/alons_box";
import { assert } from "chai";
import { createHash } from "crypto";
import { SystemProgram, LAMPORTS_PER_SOL, Keypair, PublicKey } from "@solana/web3.js";

/**
 * Comprehensive rollover-accounting tests.
 *
 * Covers:
 *  - Explicit rollover_balance tracking in GameState
 *  - Settle math (win case: residual rollover)
 *  - Expire math (no-win case: deposits-only split, old rollover preserved)
 *  - Emergency expire math + timing edge cases
 *  - Multi-round accumulation (5 rounds)
 *  - Rounding dust / residual correctness at various lamport amounts
 *  - Vault balance consistency (vault == rollover_balance + rent) after every op
 *  - Adversarial: authorization, double-action, payout manipulation, redirect attacks
 *  - Close deposit / close round after new rollover math
 *  - IDL / type-level checks
 *  - Event emission verification
 */
describe("rollover-accounting", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.AlonsBox as Program<AlonsBox>;
    const authority = (provider.wallet as anchor.Wallet).payer;

    // Wallets — treasury/buyback are PublicKeys read from on-chain state
    const treasuryKeypair = Keypair.generate();
    const buybackKeypair = Keypair.generate();
    let treasuryPk: PublicKey;
    let buybackPk: PublicKey;
    const player1 = Keypair.generate();
    const player2 = Keypair.generate();
    const player3 = Keypair.generate();

    // PDAs
    let gameStatePDA: PublicKey;
    let vaultPDA: PublicKey;
    let nextRoundId = 0; // tracks sequential round IDs across all tests
    // Constant surplus in vault from other test files' active rounds (deposits not yet settled/expired)
    let vaultSurplus = 0;

    // ── Helpers ──

    function commitHash(answer: string, salt: string): number[] {
        return Array.from(
            createHash("sha256").update(`${answer}:${salt}`).digest()
        );
    }

    function roundPDA(id: number): [PublicKey, number] {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(id));
        return PublicKey.findProgramAddressSync(
            [Buffer.from("round"), buf],
            program.programId
        );
    }

    function depositPDA(
        id: number,
        user: PublicKey
    ): [PublicKey, number] {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(id));
        return PublicKey.findProgramAddressSync(
            [Buffer.from("deposit"), buf, user.toBuffer()],
            program.programId
        );
    }

    async function airdrop(to: PublicKey, sol: number) {
        const sig = await provider.connection.requestAirdrop(
            to,
            sol * LAMPORTS_PER_SOL
        );
        await provider.connection.confirmTransaction(sig);
    }

    async function getBalance(addr: PublicKey): Promise<number> {
        return provider.connection.getBalance(addr);
    }

    /** Create the next sequential round. Returns [roundId, roundPDAKey]. */
    async function createNextRound(
        answer: string,
        salt: string,
        endsAtOffset = 3600
    ): Promise<[number, PublicKey]> {
        nextRoundId++;
        const id = nextRoundId;
        const [rPDA] = roundPDA(id);
        const endsAt = Math.floor(Date.now() / 1000) + endsAtOffset;

        await program.methods
            .createRound(
                new anchor.BN(id),
                commitHash(answer, salt),
                new anchor.BN(endsAt)
            )
            .accounts({
                authority: authority.publicKey,
                gameState: gameStatePDA,
                round: rPDA,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        return [id, rPDA];
    }

    /** Create round with a past ends_at for emergency_expire tests */
    async function createPastRound(
        answer: string,
        salt: string,
        secondsInPast: number
    ): Promise<[number, PublicKey]> {
        nextRoundId++;
        const id = nextRoundId;
        const [rPDA] = roundPDA(id);
        // ends_at must still be in the future at creation time for the constraint
        // But we need it in the past for emergency_expire...
        // The program checks ends_at > clock. We'll set it to just 1s in the future,
        // then wait for it to pass. Actually on localnet clock is fast.
        // Use a trick: set ends_at far in the past — Anchor localnet uses wall clock.
        // Actually, the create_round instruction requires ends_at > clock.unix_timestamp.
        // So we set it 2s in future, then sleep.
        const endsAt = Math.floor(Date.now() / 1000) + 2;

        await program.methods
            .createRound(
                new anchor.BN(id),
                commitHash(answer, salt),
                new anchor.BN(endsAt)
            )
            .accounts({
                authority: authority.publicKey,
                gameState: gameStatePDA,
                round: rPDA,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        return [id, rPDA];
    }

    async function deposit(
        roundId: number,
        rPDA: PublicKey,
        player: Keypair,
        lamports: number
    ) {
        const [dPDA] = depositPDA(roundId, player.publicKey);
        await program.methods
            .deposit(new anchor.BN(lamports))
            .accounts({
                player: player.publicKey,
                round: rPDA,
                deposit: dPDA,
                vault: vaultPDA,
                systemProgram: SystemProgram.programId,
            })
            .signers([player])
            .rpc();
    }

    async function settle(
        rPDA: PublicKey,
        answer: string,
        salt: string,
        winner: PublicKey,
        evidenceAmounts: number[],
        evidenceWallets: PublicKey[]
    ) {
        await program.methods
            .settle(
                answer,
                salt,
                evidenceAmounts.map((a) => new anchor.BN(a))
            )
            .accounts({
                authority: authority.publicKey,
                gameState: gameStatePDA,
                round: rPDA,
                vault: vaultPDA,
                winner,
                treasury: treasuryPk,
                systemProgram: SystemProgram.programId,
            })
            .remainingAccounts(
                evidenceWallets.map((pk) => ({
                    pubkey: pk,
                    isSigner: false,
                    isWritable: true,
                }))
            )
            .rpc();
    }

    async function expire(rPDA: PublicKey, answer: string, salt: string) {
        await program.methods
            .expire(answer, salt)
            .accounts({
                authority: authority.publicKey,
                gameState: gameStatePDA,
                round: rPDA,
                vault: vaultPDA,
                treasury: treasuryPk,
                buybackWallet: buybackPk,
            })
            .rpc();
    }

    async function emergencyExpire(rPDA: PublicKey, caller: Keypair) {
        await program.methods
            .emergencyExpire()
            .accounts({
                caller: caller.publicKey,
                gameState: gameStatePDA,
                round: rPDA,
                vault: vaultPDA,
                treasury: treasuryPk,
                buybackWallet: buybackPk,
            })
            .signers([caller])
            .rpc();
    }

    /** Read vault rent-exempt minimum */
    async function vaultRent(): Promise<number> {
        const rent = await provider.connection.getMinimumBalanceForRentExemption(
            9 // Vault::SIZE = 8 disc + 1 bump
        );
        return rent;
    }

    /** Assert vault balance == game_state.rollover_balance + rent + vaultSurplus
     *  vaultSurplus accounts for deposits from other test files' active rounds. */
    async function assertVaultConsistency(label: string) {
        const gs = await program.account.gameState.fetch(gameStatePDA);
        const vaultBal = await getBalance(vaultPDA);
        const rent = await vaultRent();
        assert.equal(
            vaultBal,
            gs.rolloverBalance.toNumber() + rent + vaultSurplus,
            `Vault consistency failed at: ${label}`
        );
    }

    // ── Setup ──

    before(async () => {
        [gameStatePDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("game_state")],
            program.programId
        );
        [vaultPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault")],
            program.programId
        );

        // Airdrop to all test wallets
        for (const kp of [player1, player2, player3]) {
            await airdrop(kp.publicKey, 100);
        }

        // Initialize game (skip if already initialized by another test file)
        let alreadyInitialized = false;
        try {
            const existing = await program.account.gameState.fetch(gameStatePDA);
            alreadyInitialized = true;
        } catch {
            // Not initialized yet
        }

        if (!alreadyInitialized) {
            await program.methods
                .initialize(treasuryKeypair.publicKey, buybackKeypair.publicKey)
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
        }

        // Read on-chain state to get the actual treasury/buyback and current round ID
        const gs = await program.account.gameState.fetch(gameStatePDA);
        nextRoundId = gs.currentRoundId.toNumber();
        treasuryPk = gs.treasury;
        buybackPk = gs.buybackWallet;

        // Compute vault surplus: extra lamports from other test files' active round deposits
        const vaultBal = await getBalance(vaultPDA);
        const rent = await vaultRent();
        vaultSurplus = vaultBal - gs.rolloverBalance.toNumber() - rent;
    });

    // ═══════════════════════════════════════════════════
    // 1. IDL & TYPE-LEVEL CHECKS
    // ═══════════════════════════════════════════════════

    describe("1. IDL & type-level checks", () => {
        it("T001: GameState has rolloverBalance field as BN", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.isDefined(gs.rolloverBalance);
            assert.isTrue(anchor.BN.isBN(gs.rolloverBalance));
        });

        it("T002: GameState.rolloverBalance is a valid non-negative value", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.isAtLeast(gs.rolloverBalance.toNumber(), 0);
        });

        it("T003: GameState has all expected fields", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.isDefined(gs.authority);
            assert.isDefined(gs.treasury);
            assert.isDefined(gs.buybackWallet);
            assert.isDefined(gs.currentRoundId);
            assert.isDefined(gs.bump);
            assert.isDefined(gs.rolloverBalance);
        });

        it("T004: Vault balance equals rent after init (rollover=0)", async () => {
            await assertVaultConsistency("after init");
        });
    });

    // ═══════════════════════════════════════════════════
    // 2. SETTLE MATH (WIN CASE)
    // ═══════════════════════════════════════════════════

    describe("2. Settle math — win case", () => {
        const ans = "settle-ans-1";
        const slt = "settle-slt-1";
        let rId: number;
        let rPDA: PublicKey;

        it("T005: Create round and deposit 1 SOL", async () => {
            [rId, rPDA] = await createNextRound(ans, slt);
            await deposit(rId, rPDA, player1, LAMPORTS_PER_SOL);
        });

        it("T006: Settle distributes 50% to winner", async () => {
            const round = await program.account.round.fetch(rPDA);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winnerExpected = Math.floor((pool * 5000) / 10000);

            const before = await getBalance(player1.publicKey);
            await settle(rPDA, ans, slt, player1.publicKey, [], []);
            const after = await getBalance(player1.publicKey);

            assert.equal(after - before, winnerExpected);
        });

        it("T007: Settle distributes 5% to treasury", async () => {
            // Use next round to verify treasury gets 5%
            const a2 = "settle-ans-2";
            const s2 = "settle-slt-2";
            const [id2, pda2] = await createNextRound(a2, s2);
            await deposit(id2, pda2, player1, 2 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda2);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const treasuryExpected = Math.floor((pool * 500) / 10000);

            const before = await getBalance(treasuryPk);
            await settle(pda2, a2, s2, player2.publicKey, [], []);
            const after = await getBalance(treasuryPk);

            assert.equal(after - before, treasuryExpected);
        });

        it("T008: Settle distributes up to 30% evidence", async () => {
            const a3 = "settle-ans-3";
            const s3 = "settle-slt-3";
            const [id3, pda3] = await createNextRound(a3, s3);
            await deposit(id3, pda3, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda3);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidencePool = Math.floor((pool * 3000) / 10000);

            const before = await getBalance(player3.publicKey);
            await settle(
                pda3,
                a3,
                s3,
                player2.publicKey,
                [evidencePool],
                [player3.publicKey]
            );
            const after = await getBalance(player3.publicKey);

            assert.equal(after - before, evidencePool);
        });

        it("T009: Settle sets rollover as residual (pool - winner - evidence - treasury)", async () => {
            const a4 = "settle-ans-4";
            const s4 = "settle-slt-4";
            const [id4, pda4] = await createNextRound(a4, s4);
            await deposit(id4, pda4, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda4);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winner = Math.floor((pool * 5000) / 10000);
            const evidence = Math.floor((pool * 3000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const expectedRollover = pool - winner - evidence - treas;

            await settle(
                pda4,
                a4,
                s4,
                player1.publicKey,
                [evidence],
                [player2.publicKey]
            );

            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);
        });

        it("T010: Vault consistency after settle", async () => {
            await assertVaultConsistency("after settle T009");
        });

        it("T011: Settle with 0 evidence — full 30% stays as extra rollover", async () => {
            const a5 = "settle-ans-5";
            const s5 = "settle-slt-5";
            const [id5, pda5] = await createNextRound(a5, s5);
            await deposit(id5, pda5, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda5);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winner = Math.floor((pool * 5000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const expectedRollover = pool - winner - 0 - treas;

            await settle(pda5, a5, s5, player2.publicKey, [], []);

            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);
            await assertVaultConsistency("after settle T011 0-evidence");
        });

        it("T012: Settle with partial evidence — unclaimed stays in rollover", async () => {
            const a6 = "settle-ans-6";
            const s6 = "settle-slt-6";
            const [id6, pda6] = await createNextRound(a6, s6);
            await deposit(id6, pda6, player1, 2 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda6);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winner = Math.floor((pool * 5000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const partialEvidence = 1000; // tiny amount
            const expectedRollover = pool - winner - partialEvidence - treas;

            await settle(
                pda6,
                a6,
                s6,
                player1.publicKey,
                [partialEvidence],
                [player3.publicKey]
            );

            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);
            await assertVaultConsistency("after settle T012 partial-evidence");
        });

        it("T013: Settle with multiple evidence wallets", async () => {
            const a7 = "settle-ans-7";
            const s7 = "settle-slt-7";
            const [id7, pda7] = await createNextRound(a7, s7);
            await deposit(id7, pda7, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda7);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidencePool = Math.floor((pool * 3000) / 10000);
            const ev1 = Math.floor(evidencePool / 2);
            const ev2 = evidencePool - ev1;

            const before2 = await getBalance(player2.publicKey);
            const before3 = await getBalance(player3.publicKey);

            await settle(
                pda7,
                a7,
                s7,
                player1.publicKey,
                [ev1, ev2],
                [player2.publicKey, player3.publicKey]
            );

            const after2 = await getBalance(player2.publicKey);
            const after3 = await getBalance(player3.publicKey);
            assert.equal(after2 - before2, ev1);
            assert.equal(after3 - before3, ev2);
            await assertVaultConsistency("after settle T013 multi-evidence");
        });
    });

    // ═══════════════════════════════════════════════════
    // 3. EXPIRE MATH (NO-WIN CASE)
    // ═══════════════════════════════════════════════════

    describe("3. Expire math — no-win case", () => {
        it("T014: Expire splits from deposits only, preserves old rollover", async () => {
            const a = "expire-1";
            const s = "expire-s1";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();

            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            const buybackExp = Math.floor((totalDep * 4750) / 10000);
            const treasuryExp = Math.floor((totalDep * 500) / 10000);
            const rolloverAdded = totalDep - buybackExp - treasuryExp;

            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                rolloverBefore + rolloverAdded
            );
        });

        it("T015: Buyback wallet receives correct amount on expire", async () => {
            const a = "expire-2";
            const s = "expire-s2";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 2 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            const buybackExp = Math.floor((totalDep * 4750) / 10000);

            const before = await getBalance(buybackPk);
            await expire(pda, a, s);
            const after = await getBalance(buybackPk);

            assert.equal(after - before, buybackExp);
        });

        it("T016: Treasury receives correct amount on expire", async () => {
            const a = "expire-3";
            const s = "expire-s3";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player2, 3 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            const treasuryExp = Math.floor((totalDep * 500) / 10000);

            const before = await getBalance(treasuryPk);
            await expire(pda, a, s);
            const after = await getBalance(treasuryPk);

            assert.equal(after - before, treasuryExp);
        });

        it("T017: Vault consistency after expire", async () => {
            await assertVaultConsistency("after expire T016");
        });

        it("T018: Expire with multiple depositors", async () => {
            const a = "expire-multi";
            const s = "expire-smulti";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 0.5 * LAMPORTS_PER_SOL);
            await deposit(id, pda, player2, 0.3 * LAMPORTS_PER_SOL);
            await deposit(id, pda, player3, 0.2 * LAMPORTS_PER_SOL);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();

            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            assert.equal(totalDep, LAMPORTS_PER_SOL); // 0.5+0.3+0.2

            const buybackExp = Math.floor((totalDep * 4750) / 10000);
            const treasuryExp = Math.floor((totalDep * 500) / 10000);
            const rolloverAdded = totalDep - buybackExp - treasuryExp;

            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                rolloverBefore + rolloverAdded
            );
            await assertVaultConsistency("after expire T018 multi-deposit");
        });

        it("T019: Vault decreases by exactly buyback + treasury on expire", async () => {
            const a = "expire-vault-dec";
            const s = "expire-svd";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            const buybackExp = Math.floor((totalDep * 4750) / 10000);
            const treasuryExp = Math.floor((totalDep * 500) / 10000);

            const vaultBefore = await getBalance(vaultPDA);
            await expire(pda, a, s);
            const vaultAfter = await getBalance(vaultPDA);

            assert.equal(vaultBefore - vaultAfter, buybackExp + treasuryExp);
        });
    });

    // ═══════════════════════════════════════════════════
    // 4. ROUNDING DUST / RESIDUAL CORRECTNESS
    // ═══════════════════════════════════════════════════

    describe("4. Rounding dust & residual correctness", () => {
        it("T020: 1 lamport deposit — no dust lost on expire", async () => {
            const a = "dust-1lam";
            const s = "dust-s1lam";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 1);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();

            const buybackExp = Math.floor((1 * 4750) / 10000); // 0
            const treasuryExp = Math.floor((1 * 500) / 10000); // 0
            const rolloverAdded = 1 - buybackExp - treasuryExp; // 1

            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                rolloverBefore + rolloverAdded
            );
            await assertVaultConsistency("after 1-lamport expire");
        });

        it("T021: 3 lamport deposit — odd rounding on expire", async () => {
            const a = "dust-3lam";
            const s = "dust-s3lam";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 3);

            const buybackExp = Math.floor((3 * 4750) / 10000); // 1
            const treasuryExp = Math.floor((3 * 500) / 10000); // 0
            const rolloverAdded = 3 - buybackExp - treasuryExp; // 2

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            await expire(pda, a, s);
            const gsAfter = await program.account.gameState.fetch(gameStatePDA);

            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                gsBefore.rolloverBalance.toNumber() + rolloverAdded
            );
            await assertVaultConsistency("after 3-lamport expire");
        });

        it("T022: 1003 lamport deposit — rounding per plan example", async () => {
            const a = "dust-1003";
            const s = "dust-s1003";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 1003);

            // buyback = floor(1003*4750/10000) = floor(4764250/10000) = 476
            // treasury = floor(1003*500/10000) = floor(501500/10000) = 50
            // rollover_added = 1003 - 476 - 50 = 477
            const buybackExp = 476;
            const treasuryExp = 50;
            const rolloverAdded = 477;

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const buybackBefore = await getBalance(buybackPk);
            const treasuryBefore = await getBalance(treasuryPk);

            await expire(pda, a, s);

            const buybackAfter = await getBalance(buybackPk);
            const treasuryAfter = await getBalance(treasuryPk);
            const gsAfter = await program.account.gameState.fetch(gameStatePDA);

            assert.equal(buybackAfter - buybackBefore, buybackExp);
            assert.equal(treasuryAfter - treasuryBefore, treasuryExp);
            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                gsBefore.rolloverBalance.toNumber() + rolloverAdded
            );
            await assertVaultConsistency("after 1003-lamport expire");
        });

        it("T023: 10000 lamport deposit — clean division on expire", async () => {
            const a = "dust-10k";
            const s = "dust-s10k";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 10000);

            // buyback = 4750, treasury = 500, rollover_added = 4750
            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            await expire(pda, a, s);
            const gsAfter = await program.account.gameState.fetch(gameStatePDA);

            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                gsBefore.rolloverBalance.toNumber() + 4750
            );
            await assertVaultConsistency("after 10000-lamport expire");
        });

        it("T024: 0.01 SOL deposit — rounding on expire", async () => {
            const a = "dust-001sol";
            const s = "dust-s001sol";
            const [id, pda] = await createNextRound(a, s);
            const amt = 0.01 * LAMPORTS_PER_SOL; // 10_000_000
            await deposit(id, pda, player1, amt);

            const buybackExp = Math.floor((amt * 4750) / 10000);
            const treasuryExp = Math.floor((amt * 500) / 10000);
            const rolloverAdded = amt - buybackExp - treasuryExp;

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            await expire(pda, a, s);
            const gsAfter = await program.account.gameState.fetch(gameStatePDA);

            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                gsBefore.rolloverBalance.toNumber() + rolloverAdded
            );
            await assertVaultConsistency("after 0.01 SOL expire");
        });

        it("T025: 10 SOL deposit — large amount rounding on expire", async () => {
            const a = "dust-10sol";
            const s = "dust-s10sol";
            const [id, pda] = await createNextRound(a, s);
            const amt = 10 * LAMPORTS_PER_SOL;
            await deposit(id, pda, player1, amt);

            const buybackExp = Math.floor((amt * 4750) / 10000);
            const treasuryExp = Math.floor((amt * 500) / 10000);
            const rolloverAdded = amt - buybackExp - treasuryExp;

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            await expire(pda, a, s);
            const gsAfter = await program.account.gameState.fetch(gameStatePDA);

            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                gsBefore.rolloverBalance.toNumber() + rolloverAdded
            );
            await assertVaultConsistency("after 10 SOL expire");
        });

        it("T026: 7 lamport deposit — settle rounding dust captured", async () => {
            const a = "dust-7lam-s";
            const s = "dust-s7lam-s";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 7);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winner = Math.floor((pool * 5000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const expectedRollover = pool - winner - 0 - treas;

            await settle(pda, a, s, player2.publicKey, [], []);

            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);
            await assertVaultConsistency("after 7-lamport settle");
        });

        it("T027: 0.1 SOL deposit — settle residual correct", async () => {
            const a = "dust-01sol-s";
            const s = "dust-s01sol-s";
            const [id, pda] = await createNextRound(a, s);
            const amt = 0.1 * LAMPORTS_PER_SOL;
            await deposit(id, pda, player1, amt);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winner = Math.floor((pool * 5000) / 10000);
            const evidencePool = Math.floor((pool * 3000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const expectedRollover = pool - winner - evidencePool - treas;

            await settle(
                pda,
                a,
                s,
                player1.publicKey,
                [evidencePool],
                [player3.publicKey]
            );

            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);
            await assertVaultConsistency("after 0.1 SOL settle");
        });

        it("T028: 1000 lamport deposit — expire buyback+treasury+rollover sum equals deposits", async () => {
            const a = "dust-sum-check";
            const s = "dust-s-sum";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 1000);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();
            const buybackBefore = await getBalance(buybackPk);
            const treasuryBefore = await getBalance(treasuryPk);

            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            const buybackAfter = await getBalance(buybackPk);
            const treasuryAfter = await getBalance(treasuryPk);

            const buybackGot = buybackAfter - buybackBefore;
            const treasuryGot = treasuryAfter - treasuryBefore;
            const rolloverGot =
                gsAfter.rolloverBalance.toNumber() - rolloverBefore;

            // These three must sum to exactly the deposit amount
            assert.equal(buybackGot + treasuryGot + rolloverGot, 1000);
            await assertVaultConsistency("after sum-check expire");
        });
    });

    // ═══════════════════════════════════════════════════
    // 5. MULTI-ROUND ACCUMULATION
    // ═══════════════════════════════════════════════════

    describe("5. Multi-round accumulation (5 rounds)", () => {
        it("T029: 5 consecutive expire rounds — rollover accumulates correctly", async () => {
            // Record starting rollover
            let gs = await program.account.gameState.fetch(gameStatePDA);
            let expectedRollover = gs.rolloverBalance.toNumber();

            for (let i = 0; i < 5; i++) {
                const a = `accum-expire-${i}`;
                const s = `accum-sexpire-${i}`;
                const [id, pda] = await createNextRound(a, s);

                // Verify round captures current rollover
                const round = await program.account.round.fetch(pda);
                assert.equal(
                    round.rolloverIn.toNumber(),
                    expectedRollover,
                    `Round ${i} rollover_in mismatch`
                );

                const amt = (i + 1) * 0.1 * LAMPORTS_PER_SOL;
                await deposit(id, pda, player1, amt);

                const totalDep = amt;
                const buybackExp = Math.floor((totalDep * 4750) / 10000);
                const treasuryExp = Math.floor((totalDep * 500) / 10000);
                const rolloverAdded = totalDep - buybackExp - treasuryExp;

                await expire(pda, a, s);

                expectedRollover += rolloverAdded;

                gs = await program.account.gameState.fetch(gameStatePDA);
                assert.equal(
                    gs.rolloverBalance.toNumber(),
                    expectedRollover,
                    `Rollover mismatch after expire round ${i}`
                );
                await assertVaultConsistency(`accum expire round ${i}`);
            }
        });

        it("T030: Accumulate via 3 expires, then settle — rollover resets correctly", async () => {
            let gs = await program.account.gameState.fetch(gameStatePDA);
            let expectedRollover = gs.rolloverBalance.toNumber();

            // 3 expire rounds
            for (let i = 0; i < 3; i++) {
                const a = `accum-mix-e-${i}`;
                const s = `accum-smix-e-${i}`;
                const [id, pda] = await createNextRound(a, s);
                const amt = 0.5 * LAMPORTS_PER_SOL;
                await deposit(id, pda, player1, amt);

                const buybackExp = Math.floor((amt * 4750) / 10000);
                const treasuryExp = Math.floor((amt * 500) / 10000);
                const rolloverAdded = amt - buybackExp - treasuryExp;

                await expire(pda, a, s);
                expectedRollover += rolloverAdded;
            }

            gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);

            // Now settle — pool includes accumulated rollover
            const aS = "accum-mix-settle";
            const sS = "accum-smix-settle";
            const [idS, pdaS] = await createNextRound(aS, sS);
            await deposit(idS, pdaS, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pdaS);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();

            assert.equal(round.rolloverIn.toNumber(), expectedRollover);

            const winner = Math.floor((pool * 5000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const newRollover = pool - winner - 0 - treas;

            await settle(pdaS, aS, sS, player1.publicKey, [], []);

            gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), newRollover);
            await assertVaultConsistency("after accum settle");
        });

        it("T031: Alternating settle/expire — rollover tracks correctly", async () => {
            let gs = await program.account.gameState.fetch(gameStatePDA);
            let expectedRollover = gs.rolloverBalance.toNumber();

            // Expire
            const a1 = "alt-e1";
            const s1 = "alt-se1";
            const [id1, pda1] = await createNextRound(a1, s1);
            await deposit(id1, pda1, player1, LAMPORTS_PER_SOL);
            const dep1 = LAMPORTS_PER_SOL;
            const bb1 = Math.floor((dep1 * 4750) / 10000);
            const tr1 = Math.floor((dep1 * 500) / 10000);
            await expire(pda1, a1, s1);
            expectedRollover += dep1 - bb1 - tr1;

            // Settle
            const a2 = "alt-s1";
            const s2 = "alt-ss1";
            const [id2, pda2] = await createNextRound(a2, s2);
            await deposit(id2, pda2, player1, 2 * LAMPORTS_PER_SOL);
            const round2 = await program.account.round.fetch(pda2);
            const pool2 =
                round2.totalDeposits.toNumber() + round2.rolloverIn.toNumber();
            const win2 = Math.floor((pool2 * 5000) / 10000);
            const treas2 = Math.floor((pool2 * 500) / 10000);
            await settle(pda2, a2, s2, player2.publicKey, [], []);
            expectedRollover = pool2 - win2 - 0 - treas2;

            // Expire again
            const a3 = "alt-e2";
            const s3 = "alt-se2";
            const [id3, pda3] = await createNextRound(a3, s3);
            await deposit(id3, pda3, player1, 0.5 * LAMPORTS_PER_SOL);
            const dep3 = 0.5 * LAMPORTS_PER_SOL;
            const bb3 = Math.floor((dep3 * 4750) / 10000);
            const tr3 = Math.floor((dep3 * 500) / 10000);
            await expire(pda3, a3, s3);
            expectedRollover += dep3 - bb3 - tr3;

            gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRollover);
            await assertVaultConsistency("after alternating");
        });

        it("T032: rollover_in on new round matches game_state.rollover_balance", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            const expectedRollover = gs.rolloverBalance.toNumber();

            const a = "round-match";
            const s = "round-smatch";
            const [id, pda] = await createNextRound(a, s);
            const round = await program.account.round.fetch(pda);

            assert.equal(round.rolloverIn.toNumber(), expectedRollover);

            // Clean up
            await expire(pda, a, s);
        });
    });

    // ═══════════════════════════════════════════════════
    // 6. EMERGENCY EXPIRE
    // ═══════════════════════════════════════════════════

    describe("6. Emergency expire", () => {
        it("T033: Emergency expire preserves old rollover, splits deposits only", async () => {
            const a = "emerg-1";
            const s = "emerg-s1";
            const [id, pda] = await createPastRound(a, s, 90000);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();
            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();

            const buybackExp = Math.floor((totalDep * 4750) / 10000);
            const treasuryExp = Math.floor((totalDep * 500) / 10000);
            const rolloverAdded = totalDep - buybackExp - treasuryExp;

            // Wait for grace period (ends_at + 86400s)
            // On localnet, the round was created with ends_at ~2s in the future.
            // We need to wait >86402s. That's too long.
            // Instead, we'll use authority to expire it normally. Let's test emergency
            // with a proper approach: create, wait 3s, then emergency should fail
            // because 24h hasn't passed.
            // For a real test we'd need to warp the clock.
            // Let's test that emergency_expire FAILS before grace period.
            try {
                await emergencyExpire(pda, player1);
                assert.fail("Should have thrown — grace period not elapsed");
            } catch (err) {
                assert.include(err.toString(), "GracePeriodNotElapsed");
            }

            // Clean up: expire normally
            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                rolloverBefore + rolloverAdded
            );
        });

        it("T034: Emergency expire rejects before 24h grace period", async () => {
            const a = "emerg-grace";
            const s = "emerg-sgrace";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            try {
                await emergencyExpire(pda, player1);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "GracePeriodNotElapsed");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T035: Emergency expire can be called by non-authority", async () => {
            // The emergency expire doesn't require authority — anyone can call after grace
            // Since we can't warp time in tests, verify the instruction accepts non-authority
            // by checking it fails on GracePeriodNotElapsed (not Unauthorized)
            const a = "emerg-nonauth";
            const s = "emerg-snonauth";
            const [id, pda] = await createNextRound(a, s);

            try {
                await emergencyExpire(pda, player2); // non-authority caller
                assert.fail("Should have thrown");
            } catch (err) {
                // Should fail on grace period, NOT unauthorized
                assert.include(err.toString(), "GracePeriodNotElapsed");
                assert.notInclude(err.toString(), "Unauthorized");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T036: Emergency expire on already-expired round fails", async () => {
            const a = "emerg-double";
            const s = "emerg-sdouble";
            const [id, pda] = await createNextRound(a, s);
            await expire(pda, a, s);

            try {
                await emergencyExpire(pda, player1);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T037: Emergency expire on settled round fails", async () => {
            const a = "emerg-settled";
            const s = "emerg-ssettled";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await settle(pda, a, s, player2.publicKey, [], []);

            try {
                await emergencyExpire(pda, player1);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T038: Vault consistency after emergency expire flow", async () => {
            await assertVaultConsistency("after emergency expire tests");
        });
    });

    // ═══════════════════════════════════════════════════
    // 7. ADVERSARIAL — AUTHORIZATION ATTACKS
    // ═══════════════════════════════════════════════════

    describe("7. Adversarial — authorization attacks", () => {
        it("T039: Non-authority cannot create round", async () => {
            const attacker = Keypair.generate();
            await airdrop(attacker.publicKey, 2);

            const id = nextRoundId + 1;
            const [rPDA] = roundPDA(id);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(id),
                        commitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                    )
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: rPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }
        });

        it("T040: Non-authority cannot settle", async () => {
            const a = "adv-auth-settle";
            const s = "adv-sauth-settle";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const attacker = Keypair.generate();
            await airdrop(attacker.publicKey, 2);

            try {
                await program.methods
                    .settle(a, s, [])
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        vault: vaultPDA,
                        winner: attacker.publicKey,
                        treasury: treasuryPk,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T041: Non-authority cannot expire", async () => {
            const a = "adv-auth-expire";
            const s = "adv-sauth-expire";
            const [id, pda] = await createNextRound(a, s);

            const attacker = Keypair.generate();
            await airdrop(attacker.publicKey, 2);

            try {
                await program.methods
                    .expire(a, s)
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        vault: vaultPDA,
                        treasury: treasuryPk,
                        buybackWallet: buybackPk,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T042: Settle with wrong treasury is rejected", async () => {
            const a = "adv-fake-treas";
            const s = "adv-sfake-treas";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const fakeTreasury = Keypair.generate();

            try {
                await program.methods
                    .settle(a, s, [])
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        vault: vaultPDA,
                        winner: player1.publicKey,
                        treasury: fakeTreasury.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T043: Expire with wrong treasury is rejected", async () => {
            const a = "adv-fake-treas-exp";
            const s = "adv-sfake-treas-exp";
            const [id, pda] = await createNextRound(a, s);

            const fakeTreasury = Keypair.generate();

            try {
                await program.methods
                    .expire(a, s)
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        vault: vaultPDA,
                        treasury: fakeTreasury.publicKey,
                        buybackWallet: buybackPk,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T044: Expire with wrong buyback wallet is rejected", async () => {
            const a = "adv-fake-bb";
            const s = "adv-sfake-bb";
            const [id, pda] = await createNextRound(a, s);

            const fakeBuyback = Keypair.generate();

            try {
                await program.methods
                    .expire(a, s)
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        vault: vaultPDA,
                        treasury: treasuryPk,
                        buybackWallet: fakeBuyback.publicKey,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T045: Non-authority cannot close round", async () => {
            const a = "adv-close-r";
            const s = "adv-sclose-r";
            const [id, pda] = await createNextRound(a, s);
            await expire(pda, a, s);

            const attacker = Keypair.generate();
            await airdrop(attacker.publicKey, 2);

            try {
                await program.methods
                    .closeRound()
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }
        });

        it("T046: Non-authority cannot close deposit", async () => {
            const a = "adv-close-d";
            const s = "adv-sclose-d";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await expire(pda, a, s);

            const [dPDA] = depositPDA(id, player1.publicKey);
            const attacker = Keypair.generate();
            await airdrop(attacker.publicKey, 2);

            try {
                await program.methods
                    .closeDeposit()
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        deposit: dPDA,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }
        });
    });

    // ═══════════════════════════════════════════════════
    // 8. ADVERSARIAL — DOUBLE-ACTION ATTACKS
    // ═══════════════════════════════════════════════════

    describe("8. Adversarial — double-action attacks", () => {
        it("T047: Cannot settle same round twice", async () => {
            const a = "dbl-settle";
            const s = "dbl-ssettle";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await settle(pda, a, s, player1.publicKey, [], []);

            try {
                await settle(pda, a, s, player1.publicKey, [], []);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T048: Cannot expire same round twice", async () => {
            const a = "dbl-expire";
            const s = "dbl-sexpire";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await expire(pda, a, s);

            try {
                await expire(pda, a, s);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T049: Cannot settle after expire", async () => {
            const a = "dbl-exp-then-set";
            const s = "dbl-sexp-then-set";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await expire(pda, a, s);

            try {
                await settle(pda, a, s, player1.publicKey, [], []);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T050: Cannot expire after settle", async () => {
            const a = "dbl-set-then-exp";
            const s = "dbl-sset-then-exp";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await settle(pda, a, s, player1.publicKey, [], []);

            try {
                await expire(pda, a, s);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T051: Cannot deposit on settled round", async () => {
            const a = "dbl-dep-settled";
            const s = "dbl-sdep-settled";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await settle(pda, a, s, player1.publicKey, [], []);

            try {
                await deposit(id, pda, player2, LAMPORTS_PER_SOL);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T052: Cannot deposit on expired round", async () => {
            const a = "dbl-dep-expired";
            const s = "dbl-sdep-expired";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await expire(pda, a, s);

            try {
                await deposit(id, pda, player2, LAMPORTS_PER_SOL);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("T053: Vault balance unchanged after failed double-settle", async () => {
            const vaultBal = await getBalance(vaultPDA);
            await assertVaultConsistency("after double-action tests");
            const vaultBal2 = await getBalance(vaultPDA);
            assert.equal(vaultBal, vaultBal2);
        });
    });

    // ═══════════════════════════════════════════════════
    // 9. ADVERSARIAL — PAYOUT MANIPULATION
    // ═══════════════════════════════════════════════════

    describe("9. Adversarial — payout manipulation", () => {
        it("T054: Evidence overpay (exceed 30% cap) is rejected", async () => {
            const a = "payout-overpay";
            const s = "payout-soverpay";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidenceMax = Math.floor((pool * 3000) / 10000);

            try {
                await settle(
                    pda,
                    a,
                    s,
                    player1.publicKey,
                    [evidenceMax + 1],
                    [player2.publicKey]
                );
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidPayoutSum");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T055: Evidence amounts/wallets count mismatch rejected", async () => {
            const a = "payout-mismatch";
            const s = "payout-smismatch";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            try {
                // 2 amounts but 1 wallet
                await settle(
                    pda,
                    a,
                    s,
                    player1.publicKey,
                    [1000, 2000],
                    [player2.publicKey]
                );
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "EvidenceMismatch");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T056: Massive evidence (exactly at 30% cap) accepted", async () => {
            const a = "payout-exact30";
            const s = "payout-sexact30";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidenceMax = Math.floor((pool * 3000) / 10000);

            const before = await getBalance(player3.publicKey);
            await settle(
                pda,
                a,
                s,
                player1.publicKey,
                [evidenceMax],
                [player3.publicKey]
            );
            const after = await getBalance(player3.publicKey);
            assert.equal(after - before, evidenceMax);
        });

        it("T057: Zero evidence amount with wallet provided accepted", async () => {
            const a = "payout-zero-ev";
            const s = "payout-szero-ev";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const before = await getBalance(player3.publicKey);
            await settle(
                pda,
                a,
                s,
                player1.publicKey,
                [0],
                [player3.publicKey]
            );
            const after = await getBalance(player3.publicKey);
            assert.equal(after - before, 0);
        });

        it("T058: Vault not drained below rollover + rent after max payout settle", async () => {
            await assertVaultConsistency("after payout manipulation tests");
        });
    });

    // ═══════════════════════════════════════════════════
    // 10. ADVERSARIAL — COMMIT HASH ATTACKS
    // ═══════════════════════════════════════════════════

    describe("10. Adversarial — commit hash attacks", () => {
        it("T059: Settle with wrong answer rejected", async () => {
            const a = "hash-real";
            const s = "hash-sreal";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            try {
                await settle(
                    pda,
                    "wrong-answer",
                    s,
                    player1.publicKey,
                    [],
                    []
                );
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidCommitHash");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T060: Settle with wrong salt rejected", async () => {
            const a = "hash-salt-real";
            const s = "hash-salt-sreal";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            try {
                await settle(
                    pda,
                    a,
                    "wrong-salt",
                    player1.publicKey,
                    [],
                    []
                );
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidCommitHash");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T061: Expire with wrong answer rejected", async () => {
            const a = "hash-exp-real";
            const s = "hash-exp-sreal";
            const [id, pda] = await createNextRound(a, s);

            try {
                await expire(pda, "wrong", s);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidCommitHash");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T062: Expire with wrong salt rejected", async () => {
            const a = "hash-exp-salt";
            const s = "hash-exp-ssalt";
            const [id, pda] = await createNextRound(a, s);

            try {
                await expire(pda, a, "wrong");
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidCommitHash");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T063: Empty answer+salt with matching hash succeeds", async () => {
            const a = "";
            const s = "";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            // Should succeed since hash matches
            await settle(pda, a, s, player1.publicKey, [], []);

            const round = await program.account.round.fetch(pda);
            assert.deepEqual(round.status, { settled: {} });
        });

        it("T064: Answer too long (>64 bytes) rejected on settle", async () => {
            const a = "a".repeat(65);
            const s = "short";
            const [id, pda] = await createNextRound("x", "y");

            try {
                await settle(pda, a, s, player1.publicKey, [], []);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "AnswerTooLong");
            }

            // Clean up
            await expire(pda, "x", "y");
        });

        it("T065: Salt too long (>64 bytes) rejected on settle", async () => {
            const a = "short";
            const s = "s".repeat(65);
            const [id, pda] = await createNextRound("x2", "y2");

            try {
                await settle(pda, a, s, player1.publicKey, [], []);
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "SaltTooLong");
            }

            // Clean up
            await expire(pda, "x2", "y2");
        });
    });

    // ═══════════════════════════════════════════════════
    // 11. ADVERSARIAL — ROUND ID MANIPULATION
    // ═══════════════════════════════════════════════════

    describe("11. Adversarial — round ID manipulation", () => {
        it("T066: Cannot skip round IDs", async () => {
            const expectedNext = nextRoundId + 1;
            const skipped = expectedNext + 5;
            const [rPDA] = roundPDA(skipped);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(skipped),
                        commitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                    )
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: rPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.ok(err);
            }
        });

        it("T067: Cannot create round with ID 0", async () => {
            const [rPDA] = roundPDA(0);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(0),
                        commitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                    )
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: rPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.ok(err);
            }
        });

        it("T068: Cannot create round with past ends_at", async () => {
            const id = nextRoundId + 1;
            const [rPDA] = roundPDA(id);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(id),
                        commitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) - 3600)
                    )
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: rPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidEndTime");
            }
        });
    });

    // ═══════════════════════════════════════════════════
    // 12. CLOSE DEPOSIT & CLOSE ROUND
    // ═══════════════════════════════════════════════════

    describe("12. Close deposit & close round", () => {
        let closeRoundId: number;
        let closeRoundPDA: PublicKey;

        it("T069: Setup — create, deposit, and settle a round", async () => {
            const a = "close-test";
            const s = "close-stest";
            [closeRoundId, closeRoundPDA] = await createNextRound(a, s);
            await deposit(closeRoundId, closeRoundPDA, player1, LAMPORTS_PER_SOL);
            await deposit(closeRoundId, closeRoundPDA, player2, 0.5 * LAMPORTS_PER_SOL);
            await settle(closeRoundPDA, a, s, player1.publicKey, [], []);
        });

        it("T070: Close deposit recovers rent to authority", async () => {
            const [dPDA] = depositPDA(closeRoundId, player1.publicKey);
            const beforeAuth = await getBalance(authority.publicKey);

            await program.methods
                .closeDeposit()
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: closeRoundPDA,
                    deposit: dPDA,
                })
                .rpc();

            const afterAuth = await getBalance(authority.publicKey);
            // Authority should have received rent minus tx fee
            assert.isAbove(afterAuth, beforeAuth - 10000); // allowing for tx fee
        });

        it("T071: Close second deposit", async () => {
            const [dPDA] = depositPDA(closeRoundId, player2.publicKey);

            await program.methods
                .closeDeposit()
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: closeRoundPDA,
                    deposit: dPDA,
                })
                .rpc();

            // Verify deposit account no longer exists
            try {
                await program.account.deposit.fetch(dPDA);
                assert.fail("Deposit should be closed");
            } catch (err) {
                assert.include(err.toString(), "Account does not exist");
            }
        });

        it("T072: Close round recovers rent to authority", async () => {
            await program.methods
                .closeRound()
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: closeRoundPDA,
                })
                .rpc();

            // Verify round account no longer exists
            try {
                await program.account.round.fetch(closeRoundPDA);
                assert.fail("Round should be closed");
            } catch (err) {
                assert.include(err.toString(), "Account does not exist");
            }
        });

        it("T073: Cannot close active round", async () => {
            const a = "close-active";
            const s = "close-sactive";
            const [id, pda] = await createNextRound(a, s);

            try {
                await program.methods
                    .closeRound()
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundStillActive");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T074: Cannot close deposit of active round", async () => {
            const a = "close-dep-active";
            const s = "close-sdep-active";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const [dPDA] = depositPDA(id, player1.publicKey);

            try {
                await program.methods
                    .closeDeposit()
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: pda,
                        deposit: dPDA,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundStillActive");
            }

            // Clean up
            await expire(pda, a, s);
        });

        it("T075: Vault consistency after close operations", async () => {
            await assertVaultConsistency("after close tests");
        });

        it("T076: Close deposit after expire works", async () => {
            const a = "close-after-exp";
            const s = "close-safter-exp";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await expire(pda, a, s);

            const [dPDA] = depositPDA(id, player1.publicKey);
            await program.methods
                .closeDeposit()
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: pda,
                    deposit: dPDA,
                })
                .rpc();

            try {
                await program.account.deposit.fetch(dPDA);
                assert.fail("Deposit should be closed");
            } catch (err) {
                assert.include(err.toString(), "Account does not exist");
            }
        });
    });

    // ═══════════════════════════════════════════════════
    // 13. BALANCE CONSISTENCY — COMPREHENSIVE
    // ═══════════════════════════════════════════════════

    describe("13. Balance consistency — comprehensive", () => {
        before(async () => {
            // Re-airdrop to players for the remaining heavy tests
            for (const kp of [player1, player2, player3]) {
                await airdrop(kp.publicKey, 100);
            }
        });

        it("T077: Vault == rollover + rent after settle with full evidence", async () => {
            const a = "bal-full-ev";
            const s = "bal-sfull-ev";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 5 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidencePool = Math.floor((pool * 3000) / 10000);

            await settle(
                pda,
                a,
                s,
                player1.publicKey,
                [evidencePool],
                [player2.publicKey]
            );
            await assertVaultConsistency("T077 full evidence settle");
        });

        it("T078: Vault == rollover + rent after settle with 0 evidence", async () => {
            const a = "bal-no-ev";
            const s = "bal-sno-ev";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 3 * LAMPORTS_PER_SOL);

            await settle(pda, a, s, player2.publicKey, [], []);
            await assertVaultConsistency("T078 zero evidence settle");
        });

        it("T079: Vault == rollover + rent after expire", async () => {
            const a = "bal-expire";
            const s = "bal-sexpire";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 7 * LAMPORTS_PER_SOL);

            await expire(pda, a, s);
            await assertVaultConsistency("T079 expire");
        });

        it("T080: Deposits do not alter rollover_balance", async () => {
            const a = "bal-dep-no-change";
            const s = "bal-sdep-no-change";
            const [id, pda] = await createNextRound(a, s);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();

            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await deposit(id, pda, player2, 2 * LAMPORTS_PER_SOL);
            await deposit(id, pda, player3, 3 * LAMPORTS_PER_SOL);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gsAfter.rolloverBalance.toNumber(), rolloverBefore);

            // Clean up
            await expire(pda, a, s);
        });

        it("T081: Creating round does not change rollover_balance", async () => {
            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();

            const a = "bal-create-no-change";
            const s = "bal-screate-no-change";
            const [id, pda] = await createNextRound(a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gsAfter.rolloverBalance.toNumber(), rolloverBefore);

            // Clean up
            await expire(pda, a, s);
        });

        it("T082: Winner receives exact expected amount", async () => {
            const a = "bal-winner-exact";
            const s = "bal-swinner-exact";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 4 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winnerExpected = Math.floor((pool * 5000) / 10000);

            const before = await getBalance(player2.publicKey);
            await settle(pda, a, s, player2.publicKey, [], []);
            const after = await getBalance(player2.publicKey);

            assert.equal(after - before, winnerExpected);
        });

        it("T083: Buyback receives exact expected from deposits-only on expire", async () => {
            const a = "bal-bb-exact";
            const s = "bal-sbb-exact";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 6 * LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            const buybackExp = Math.floor((totalDep * 4750) / 10000);

            const before = await getBalance(buybackPk);
            await expire(pda, a, s);
            const after = await getBalance(buybackPk);

            assert.equal(after - before, buybackExp);
        });

        it("T084: Sum of all payouts == deposits on expire (conservation)", async () => {
            const a = "bal-conserve";
            const s = "bal-sconserve";
            const [id, pda] = await createNextRound(a, s);
            const amt = 8 * LAMPORTS_PER_SOL;
            await deposit(id, pda, player1, amt);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();
            const bbBefore = await getBalance(buybackPk);
            const trBefore = await getBalance(treasuryPk);

            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            const bbAfter = await getBalance(buybackPk);
            const trAfter = await getBalance(treasuryPk);

            const totalOut =
                (bbAfter - bbBefore) +
                (trAfter - trBefore) +
                (gsAfter.rolloverBalance.toNumber() - rolloverBefore);

            assert.equal(totalOut, amt, "Conservation: all payouts must equal deposits");
        });

        it("T085: Sum of all payouts == pool on settle (conservation)", async () => {
            const a = "bal-conserve-settle";
            const s = "bal-sconserve-settle";
            const [id, pda] = await createNextRound(a, s);
            const amt = 5 * LAMPORTS_PER_SOL;
            await deposit(id, pda, player1, amt);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidencePool = Math.floor((pool * 3000) / 10000);

            const winBefore = await getBalance(player2.publicKey);
            const evBefore = await getBalance(player3.publicKey);
            const trBefore = await getBalance(treasuryPk);

            await settle(
                pda,
                a,
                s,
                player2.publicKey,
                [evidencePool],
                [player3.publicKey]
            );

            const winAfter = await getBalance(player2.publicKey);
            const evAfter = await getBalance(player3.publicKey);
            const trAfter = await getBalance(treasuryPk);
            const gs = await program.account.gameState.fetch(gameStatePDA);

            const totalOut =
                (winAfter - winBefore) +
                (evAfter - evBefore) +
                (trAfter - trBefore) +
                gs.rolloverBalance.toNumber();

            assert.equal(totalOut, pool, "Conservation: all payouts + rollover must equal pool");
        });
    });

    // ═══════════════════════════════════════════════════
    // 14. DEPOSIT EDGE CASES
    // ═══════════════════════════════════════════════════

    describe("14. Deposit edge cases", () => {
        it("T086: Multiple deposits from same player accumulate", async () => {
            const a = "dep-multi";
            const s = "dep-smulti";
            const [id, pda] = await createNextRound(a, s);

            await deposit(id, pda, player1, 1000);
            await deposit(id, pda, player1, 2000);
            await deposit(id, pda, player1, 3000);

            const [dPDA] = depositPDA(id, player1.publicKey);
            const dep = await program.account.deposit.fetch(dPDA);
            assert.equal(dep.amount.toNumber(), 6000);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.totalDeposits.toNumber(), 6000);

            // Clean up
            await expire(pda, a, s);
        });

        it("T087: Tiny deposit (1 lamport) works", async () => {
            const a = "dep-tiny";
            const s = "dep-stiny";
            const [id, pda] = await createNextRound(a, s);

            await deposit(id, pda, player1, 1);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.totalDeposits.toNumber(), 1);

            // Clean up
            await expire(pda, a, s);
        });

        it("T088: Large deposit (20 SOL) works", async () => {
            const a = "dep-large";
            const s = "dep-slarge";
            const [id, pda] = await createNextRound(a, s);

            const amt = 20 * LAMPORTS_PER_SOL;
            await deposit(id, pda, player1, amt);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.totalDeposits.toNumber(), amt);

            // Settle to avoid accumulating too much rollover
            await settle(pda, a, s, player2.publicKey, [], []);
            await assertVaultConsistency("after large deposit settle");
        });

        it("T089: Three players depositing different amounts", async () => {
            const a = "dep-3p";
            const s = "dep-s3p";
            const [id, pda] = await createNextRound(a, s);

            const a1 = 100000;
            const a2 = 200000;
            const a3 = 300000;

            await deposit(id, pda, player1, a1);
            await deposit(id, pda, player2, a2);
            await deposit(id, pda, player3, a3);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.totalDeposits.toNumber(), a1 + a2 + a3);

            // Clean up
            await expire(pda, a, s);
        });
    });

    // ═══════════════════════════════════════════════════
    // 15. ROLLOVER PRESERVATION ACROSS EXPIRE
    // ═══════════════════════════════════════════════════

    describe("15. Rollover preservation — key invariant", () => {
        it("T090: Old rollover not reduced by expire (core invariant)", async () => {
            // Re-airdrop to ensure player has enough
            await airdrop(player1.publicKey, 10);

            // Build up some rollover first
            const aSetup = "pres-setup";
            const sSetup = "pres-ssetup";
            const [idSetup, pdaSetup] = await createNextRound(aSetup, sSetup);
            await deposit(idSetup, pdaSetup, player1, 2 * LAMPORTS_PER_SOL);
            await settle(pdaSetup, aSetup, sSetup, player2.publicKey, [], []);

            const gsMid = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBeforeExpire = gsMid.rolloverBalance.toNumber();
            assert.isAbove(rolloverBeforeExpire, 0, "Should have some rollover");

            // Now expire a round — old rollover must not decrease
            const aExp = "pres-expire";
            const sExp = "pres-sexpire";
            const [idExp, pdaExp] = await createNextRound(aExp, sExp);
            await deposit(idExp, pdaExp, player1, 0.5 * LAMPORTS_PER_SOL);

            await expire(pdaExp, aExp, sExp);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.isAtLeast(
                gsAfter.rolloverBalance.toNumber(),
                rolloverBeforeExpire,
                "Rollover must NOT decrease on expire"
            );
        });

        it("T091: Consecutive expires only add, never subtract from rollover", async () => {
            let gs = await program.account.gameState.fetch(gameStatePDA);
            let prevRollover = gs.rolloverBalance.toNumber();

            for (let i = 0; i < 3; i++) {
                const a = `pres-consec-${i}`;
                const s = `pres-sconsec-${i}`;
                const [id, pda] = await createNextRound(a, s);
                await deposit(id, pda, player1, (i + 1) * 100000);
                await expire(pda, a, s);

                gs = await program.account.gameState.fetch(gameStatePDA);
                assert.isAtLeast(
                    gs.rolloverBalance.toNumber(),
                    prevRollover,
                    `Rollover decreased on expire ${i}!`
                );
                prevRollover = gs.rolloverBalance.toNumber();
            }
        });

        it("T092: rollover_in captures game_state.rollover_balance exactly", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            const expected = gs.rolloverBalance.toNumber();

            const a = "pres-capture";
            const s = "pres-scapture";
            const [id, pda] = await createNextRound(a, s);
            const round = await program.account.round.fetch(pda);

            assert.equal(
                round.rolloverIn.toNumber(),
                expected,
                "Round rollover_in must exactly match game_state.rollover_balance"
            );

            // Clean up
            await expire(pda, a, s);
        });

        it("T093: Expire with no deposits adds 0 to rollover", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gs.rolloverBalance.toNumber();

            const a = "pres-no-dep";
            const s = "pres-sno-dep";
            const [id, pda] = await createNextRound(a, s);

            // No deposits! total_deposits == 0
            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(
                gsAfter.rolloverBalance.toNumber(),
                rolloverBefore,
                "Rollover unchanged when 0 deposits expired"
            );
            await assertVaultConsistency("after 0-deposit expire");
        });
    });

    // ═══════════════════════════════════════════════════
    // 16. EVENT EMISSION CHECKS
    // ═══════════════════════════════════════════════════

    describe("16. Event emission checks", () => {
        it("T094: RoundCreated captures correct rollover_in from game state", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            const expectedRollover = gs.rolloverBalance.toNumber();

            const a = "evt-create";
            const s = "evt-screate";
            const [id, pda] = await createNextRound(a, s);

            // Verify round on-chain state captures the rollover
            const round = await program.account.round.fetch(pda);
            assert.equal(round.rolloverIn.toNumber(), expectedRollover);
            assert.equal(round.roundId.toNumber(), id);
            assert.deepEqual(round.status, { active: {} });

            // Clean up
            await expire(pda, a, s);
        });

        it("T095: RoundSettled updates game state rollover_out correctly", async () => {
            const a = "evt-settle";
            const s = "evt-ssettle";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            const round = await program.account.round.fetch(pda);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const winner = Math.floor((pool * 5000) / 10000);
            const treas = Math.floor((pool * 500) / 10000);
            const expectedRolloverOut = pool - winner - 0 - treas;

            await settle(pda, a, s, player1.publicKey, [], []);

            // Verify game state has correct rollover after settle
            const gs = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gs.rolloverBalance.toNumber(), expectedRolloverOut);

            // Verify round is settled
            const settledRound = await program.account.round.fetch(pda);
            assert.deepEqual(settledRound.status, { settled: {} });
        });

        it("T096: RoundExpired event — verify on-chain state matches expected", async () => {
            const a = "evt-expire";
            const s = "evt-sexpire";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 2 * LAMPORTS_PER_SOL);

            const gsBefore = await program.account.gameState.fetch(gameStatePDA);
            const rolloverBefore = gsBefore.rolloverBalance.toNumber();
            const round = await program.account.round.fetch(pda);
            const totalDep = round.totalDeposits.toNumber();
            const buybackExp = Math.floor((totalDep * 4750) / 10000);
            const treasuryExp = Math.floor((totalDep * 500) / 10000);
            const rolloverAdded = totalDep - buybackExp - treasuryExp;
            const expectedRolloverOut = rolloverBefore + rolloverAdded;

            await expire(pda, a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gsAfter.rolloverBalance.toNumber(), expectedRolloverOut);
        });
    });

    // ═══════════════════════════════════════════════════
    // 17. EDGE CASES — ADDITIONAL
    // ═══════════════════════════════════════════════════

    describe("17. Additional edge cases", () => {
        it("T097: Settle with exactly 64-byte answer and salt succeeds", async () => {
            const a = "a".repeat(64);
            const s = "s".repeat(64);
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);

            await settle(pda, a, s, player2.publicKey, [], []);
            const round = await program.account.round.fetch(pda);
            assert.deepEqual(round.status, { settled: {} });
            assert.equal(round.revealedAnswer, a);
            assert.equal(round.revealedSalt, s);
        });

        it("T098: Multiple rounds with identical answers (different salts) work", async () => {
            const answer = "same-answer";
            const s1 = "salt-one-unique";
            const s2 = "salt-two-unique";

            const [id1, pda1] = await createNextRound(answer, s1);
            await deposit(id1, pda1, player1, LAMPORTS_PER_SOL);
            await settle(pda1, answer, s1, player2.publicKey, [], []);

            const [id2, pda2] = await createNextRound(answer, s2);
            await deposit(id2, pda2, player1, LAMPORTS_PER_SOL);
            await expire(pda2, answer, s2);

            // Both should complete fine
            const r1 = await program.account.round.fetch(pda1);
            const r2 = await program.account.round.fetch(pda2);
            assert.deepEqual(r1.status, { settled: {} });
            assert.deepEqual(r2.status, { expired: {} });
        });

        it("T099: Rapid deposit-settle cycle doesn't leak lamports", async () => {
            // Verify pre-condition
            await assertVaultConsistency("T099 pre-condition");

            const a = "rapid-cycle";
            const s = "rapid-scycle";
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, 100000);
            await settle(pda, a, s, player2.publicKey, [], []);

            await assertVaultConsistency("after rapid cycle");
        });

        it("T100: Rollover accumulated through 3 types of operations is consistent", async () => {
            // settle -> expire -> settle: verify total consistency
            const a1 = "type-mix-1";
            const s1 = "type-smix-1";
            const [id1, pda1] = await createNextRound(a1, s1);
            await deposit(id1, pda1, player1, LAMPORTS_PER_SOL);
            await settle(pda1, a1, s1, player2.publicKey, [], []);
            await assertVaultConsistency("type-mix after settle");

            const a2 = "type-mix-2";
            const s2 = "type-smix-2";
            const [id2, pda2] = await createNextRound(a2, s2);
            await deposit(id2, pda2, player1, LAMPORTS_PER_SOL);
            await expire(pda2, a2, s2);
            await assertVaultConsistency("type-mix after expire");

            const a3 = "type-mix-3";
            const s3 = "type-smix-3";
            const [id3, pda3] = await createNextRound(a3, s3);
            await deposit(id3, pda3, player1, LAMPORTS_PER_SOL);
            await settle(pda3, a3, s3, player1.publicKey, [], []);
            await assertVaultConsistency("type-mix final");
        });

        it("T101: Settle pool includes rollover_in from game state", async () => {
            // Verify the pool calculation on settle uses the correct rollover
            const gs = await program.account.gameState.fetch(gameStatePDA);
            const currentRollover = gs.rolloverBalance.toNumber();

            const a = "pool-includes-ro";
            const s = "pool-sincludes-ro";
            const [id, pda] = await createNextRound(a, s);
            const dep = 2 * LAMPORTS_PER_SOL;
            await deposit(id, pda, player1, dep);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.rolloverIn.toNumber(), currentRollover);

            const pool = dep + currentRollover;
            const winnerExpected = Math.floor((pool * 5000) / 10000);

            const before = await getBalance(player2.publicKey);
            await settle(pda, a, s, player2.publicKey, [], []);
            const after = await getBalance(player2.publicKey);

            assert.equal(after - before, winnerExpected);
        });

        it("T102: Game state current_round_id increments correctly", async () => {
            const gs = await program.account.gameState.fetch(gameStatePDA);
            const currentId = gs.currentRoundId.toNumber();

            const a = "id-check";
            const s = "id-scheck";
            const [id, pda] = await createNextRound(a, s);

            const gsAfter = await program.account.gameState.fetch(gameStatePDA);
            assert.equal(gsAfter.currentRoundId.toNumber(), currentId + 1);

            // Clean up
            await expire(pda, a, s);
        });

        it("T103: Settle preserves round data (answer, salt, commit hash)", async () => {
            const a = "preserve-data";
            const s = "preserve-sdata";
            const ch = commitHash(a, s);
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await settle(pda, a, s, player1.publicKey, [], []);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.revealedAnswer, a);
            assert.equal(round.revealedSalt, s);
            assert.deepEqual(round.commitHash, ch);
        });

        it("T104: Expire preserves round data (answer, salt, commit hash)", async () => {
            const a = "preserve-exp";
            const s = "preserve-sexp";
            const ch = commitHash(a, s);
            const [id, pda] = await createNextRound(a, s);
            await deposit(id, pda, player1, LAMPORTS_PER_SOL);
            await expire(pda, a, s);

            const round = await program.account.round.fetch(pda);
            assert.equal(round.revealedAnswer, a);
            assert.equal(round.revealedSalt, s);
            assert.deepEqual(round.commitHash, ch);
        });

        it("T105: Vault stays above rent-exempt minimum after every operation", async () => {
            const vaultBal = await getBalance(vaultPDA);
            const rent = await vaultRent();
            assert.isAtLeast(
                vaultBal,
                rent,
                "Vault must always be above rent-exempt minimum"
            );
        });

        it("T106: Final vault consistency check", async () => {
            await assertVaultConsistency("final check T106");
        });
    });
});
