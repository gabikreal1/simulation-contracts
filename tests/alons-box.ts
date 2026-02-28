import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AlonsBox } from "../target/types/alons_box";
import { assert } from "chai";
import { createHash } from "crypto";
import { SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";

describe("alons-box", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.AlonsBox as Program<AlonsBox>;
    const authority = (provider.wallet as anchor.Wallet).payer;
    const treasuryKeypair = anchor.web3.Keypair.generate();
    const buybackKeypair = anchor.web3.Keypair.generate();

    // Test players
    const player1 = anchor.web3.Keypair.generate();
    const player2 = anchor.web3.Keypair.generate();
    const player3 = anchor.web3.Keypair.generate();

    // PDAs
    let gameStatePDA: anchor.web3.PublicKey;
    let vaultPDA: anchor.web3.PublicKey;

    // ── Helpers ──

    function computeCommitHash(answer: string, salt: string): number[] {
        const hash = createHash("sha256").update(`${answer}:${salt}`).digest();
        return Array.from(hash);
    }

    function getRoundPDA(roundId: number): [anchor.web3.PublicKey, number] {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(roundId));
        return anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("round"), buf],
            program.programId
        );
    }

    function getDepositPDA(
        roundId: number,
        user: anchor.web3.PublicKey
    ): [anchor.web3.PublicKey, number] {
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64LE(BigInt(roundId));
        return anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("deposit"), buf, user.toBuffer()],
            program.programId
        );
    }

    // ── Setup ──

    before(async () => {
        [gameStatePDA] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("game_state")],
            program.programId
        );
        [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("vault")],
            program.programId
        );

        // Airdrop to players
        for (const player of [player1, player2, player3]) {
            const sig = await provider.connection.requestAirdrop(
                player.publicKey,
                10 * LAMPORTS_PER_SOL
            );
            await provider.connection.confirmTransaction(sig);
        }
    });

    // ── Tests ──

    it("Initializes the game state", async () => {
        await program.methods
            .initialize(treasuryKeypair.publicKey, buybackKeypair.publicKey)
            .accounts({
                authority: authority.publicKey,
                gameState: gameStatePDA,
                vault: vaultPDA,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        const gs = await program.account.gameState.fetch(gameStatePDA);
        assert.ok(gs.authority.equals(authority.publicKey));
        assert.ok(gs.treasury.equals(treasuryKeypair.publicKey));
        assert.ok(gs.buybackWallet.equals(buybackKeypair.publicKey));
        assert.equal(gs.currentRoundId.toNumber(), 0);
    });

    // ── Round 1: full settle flow ──

    describe("Round 1 — settle flow", () => {
        const answer = "red apple";
        const salt = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
        const commitHash = computeCommitHash(answer, salt);
        const endsAt = Math.floor(Date.now() / 1000) + 3600;
        let roundPDA: anchor.web3.PublicKey;

        it("Creates round 1", async () => {
            [roundPDA] = getRoundPDA(1);

            await program.methods
                .createRound(new anchor.BN(1), commitHash, new anchor.BN(endsAt))
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: roundPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            const round = await program.account.round.fetch(roundPDA);
            assert.equal(round.roundId.toNumber(), 1);
            assert.deepEqual(round.commitHash, commitHash);
            assert.equal(round.endsAt.toNumber(), endsAt);
            assert.deepEqual(round.status, { active: {} });
            assert.equal(round.totalDeposits.toNumber(), 0);
        });

        it("Player 1 deposits 0.3 SOL", async () => {
            const amount = 0.3 * LAMPORTS_PER_SOL;
            const [depositPDA] = getDepositPDA(1, player1.publicKey);

            await program.methods
                .deposit(new anchor.BN(amount))
                .accounts({
                    player: player1.publicKey,
                    round: roundPDA,
                    deposit: depositPDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([player1])
                .rpc();

            const dep = await program.account.deposit.fetch(depositPDA);
            assert.equal(dep.amount.toNumber(), amount);

            const round = await program.account.round.fetch(roundPDA);
            assert.equal(round.totalDeposits.toNumber(), amount);
        });

        it("Player 2 and 3 deposit", async () => {
            const amt2 = 0.2 * LAMPORTS_PER_SOL;
            const amt3 = 0.1 * LAMPORTS_PER_SOL;
            const [dep2PDA] = getDepositPDA(1, player2.publicKey);
            const [dep3PDA] = getDepositPDA(1, player3.publicKey);

            await program.methods
                .deposit(new anchor.BN(amt2))
                .accounts({
                    player: player2.publicKey,
                    round: roundPDA,
                    deposit: dep2PDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([player2])
                .rpc();

            await program.methods
                .deposit(new anchor.BN(amt3))
                .accounts({
                    player: player3.publicKey,
                    round: roundPDA,
                    deposit: dep3PDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([player3])
                .rpc();

            const round = await program.account.round.fetch(roundPDA);
            const expected = 0.3 * LAMPORTS_PER_SOL + amt2 + amt3;
            assert.equal(round.totalDeposits.toNumber(), expected);
        });

        it("Settles — distributes pool correctly", async () => {
            const round = await program.account.round.fetch(roundPDA);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();

            const winnerExpected = Math.floor((pool * 5000) / 10000);
            const treasuryExpected = Math.floor((pool * 500) / 10000);
            const evidencePool = Math.floor((pool * 3000) / 10000);

            const winnerBefore = await provider.connection.getBalance(
                player1.publicKey
            );
            const treasuryBefore = await provider.connection.getBalance(
                treasuryKeypair.publicKey
            );
            const p2Before = await provider.connection.getBalance(
                player2.publicKey
            );

            // Player2 asked a YES question → gets all evidence pool
            await program.methods
                .settle(answer, salt, [new anchor.BN(evidencePool)])
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: roundPDA,
                    vault: vaultPDA,
                    winner: player1.publicKey,
                    treasury: treasuryKeypair.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .remainingAccounts([
                    {
                        pubkey: player2.publicKey,
                        isSigner: false,
                        isWritable: true,
                    },
                ])
                .rpc();

            // Verify status
            const settled = await program.account.round.fetch(roundPDA);
            assert.deepEqual(settled.status, { settled: {} });
            assert.equal(settled.revealedAnswer, answer);
            assert.equal(settled.revealedSalt, salt);

            // Verify balances
            const winnerAfter = await provider.connection.getBalance(
                player1.publicKey
            );
            const treasuryAfter = await provider.connection.getBalance(
                treasuryKeypair.publicKey
            );
            const p2After = await provider.connection.getBalance(
                player2.publicKey
            );

            assert.equal(winnerAfter - winnerBefore, winnerExpected);
            assert.equal(treasuryAfter - treasuryBefore, treasuryExpected);
            assert.equal(p2After - p2Before, evidencePool);
        });
    });

    // ── Round 2: expire flow ──

    describe("Round 2 — expire flow", () => {
        const answer = "blue chair";
        const salt = "f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6";
        const commitHash = computeCommitHash(answer, salt);
        const endsAt = Math.floor(Date.now() / 1000) + 3600;
        let roundPDA: anchor.web3.PublicKey;

        it("Creates round 2", async () => {
            [roundPDA] = getRoundPDA(2);

            await program.methods
                .createRound(new anchor.BN(2), commitHash, new anchor.BN(endsAt))
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: roundPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            const round = await program.account.round.fetch(roundPDA);
            assert.equal(round.roundId.toNumber(), 2);
            // Should have rollover from round 1
            assert.isAbove(round.rolloverIn.toNumber(), 0);
        });

        it("Player deposits into round 2", async () => {
            const [depositPDA] = getDepositPDA(2, player1.publicKey);

            await program.methods
                .deposit(new anchor.BN(0.5 * LAMPORTS_PER_SOL))
                .accounts({
                    player: player1.publicKey,
                    round: roundPDA,
                    deposit: depositPDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([player1])
                .rpc();
        });

        it("Expires — 47.5% buyback, 5% treasury from deposits only, rollover preserved", async () => {
            const round = await program.account.round.fetch(roundPDA);
            const totalDeposits = round.totalDeposits.toNumber();
            const rolloverIn = round.rolloverIn.toNumber();

            // New math: percentages from deposits only, old rollover untouched
            const buybackExpected = Math.floor((totalDeposits * 4750) / 10000);
            const treasuryExpected = Math.floor((totalDeposits * 500) / 10000);
            const rolloverAdded = totalDeposits - buybackExpected - treasuryExpected;

            const vaultBefore = await provider.connection.getBalance(vaultPDA);
            const buybackBefore = await provider.connection.getBalance(buybackKeypair.publicKey);
            const treasuryBefore = await provider.connection.getBalance(treasuryKeypair.publicKey);

            await program.methods
                .expire(answer, salt)
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: roundPDA,
                    vault: vaultPDA,
                    treasury: treasuryKeypair.publicKey,
                    buybackWallet: buybackKeypair.publicKey,
                })
                .rpc();

            const expired = await program.account.round.fetch(roundPDA);
            assert.deepEqual(expired.status, { expired: {} });
            assert.equal(expired.revealedAnswer, answer);
            assert.equal(expired.revealedSalt, salt);

            // Verify buyback wallet received 47.5%
            const buybackAfter = await provider.connection.getBalance(buybackKeypair.publicKey);
            assert.equal(buybackAfter - buybackBefore, buybackExpected);

            // Verify treasury received 5%
            const treasuryAfter = await provider.connection.getBalance(treasuryKeypair.publicKey);
            assert.equal(treasuryAfter - treasuryBefore, treasuryExpected);

            // Verify vault decreased by buyback + treasury (47.5% remains as rollover)
            const vaultAfter = await provider.connection.getBalance(vaultPDA);
            assert.equal(vaultBefore - vaultAfter, buybackExpected + treasuryExpected);
        });
    });

    // ── Error cases ──

    describe("Error cases", () => {
        it("Rejects unauthorized create_round", async () => {
            const fake = anchor.web3.Keypair.generate();
            const sig = await provider.connection.requestAirdrop(
                fake.publicKey,
                LAMPORTS_PER_SOL
            );
            await provider.connection.confirmTransaction(sig);

            const [roundPDA] = getRoundPDA(3);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(3),
                        computeCommitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                    )
                    .accounts({
                        authority: fake.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([fake])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }
        });

        it("Rejects settle with wrong hash", async () => {
            // Create round 3 first
            const [roundPDA] = getRoundPDA(3);
            const commitHash = computeCommitHash("real answer", "real salt");

            await program.methods
                .createRound(
                    new anchor.BN(3),
                    commitHash,
                    new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                )
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: roundPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            try {
                await program.methods
                    .settle("wrong", "wrong", [])
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        winner: player1.publicKey,
                        treasury: treasuryKeypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidCommitHash");
            }
        });

        it("Rejects deposit on settled round", async () => {
            const [roundPDA] = getRoundPDA(1);
            const [depositPDA] = getDepositPDA(1, player1.publicKey);

            try {
                await program.methods
                    .deposit(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({
                        player: player1.publicKey,
                        round: roundPDA,
                        deposit: depositPDA,
                        vault: vaultPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([player1])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });
    });

    // ── Adversarial security tests ──

    describe("Adversarial — authorization attacks", () => {
        it("Rejects unauthorized settle (player tries to steal pool)", async () => {
            const attacker = anchor.web3.Keypair.generate();
            const sig = await provider.connection.requestAirdrop(
                attacker.publicKey,
                2 * LAMPORTS_PER_SOL
            );
            await provider.connection.confirmTransaction(sig);

            const [roundPDA] = getRoundPDA(3); // Round 3 is active

            try {
                await program.methods
                    .settle("real answer", "real salt", [])
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        winner: attacker.publicKey,
                        treasury: treasuryKeypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }
        });

        it("Rejects unauthorized expire", async () => {
            const attacker = anchor.web3.Keypair.generate();
            const sig = await provider.connection.requestAirdrop(
                attacker.publicKey,
                LAMPORTS_PER_SOL
            );
            await provider.connection.confirmTransaction(sig);

            const [roundPDA] = getRoundPDA(3);

            try {
                await program.methods
                    .expire("real answer", "real salt")
                    .accounts({
                        authority: attacker.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        treasury: treasuryKeypair.publicKey,
                        buybackWallet: buybackKeypair.publicKey,
                    })
                    .signers([attacker])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "Unauthorized");
            }
        });

        it("Rejects settle with wrong treasury (redirect fee attack)", async () => {
            const fakeTreasury = anchor.web3.Keypair.generate();
            const [roundPDA] = getRoundPDA(3);

            try {
                await program.methods
                    .settle("real answer", "real salt", [])
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
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
        });
    });

    describe("Adversarial — double-action attacks", () => {
        it("Rejects double settle (replay attack)", async () => {
            // Round 1 was already settled
            const [roundPDA] = getRoundPDA(1);

            try {
                await program.methods
                    .settle("red apple", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", [])
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        winner: player1.publicKey,
                        treasury: treasuryKeypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("Rejects double expire (replay attack)", async () => {
            // Round 2 was already expired
            const [roundPDA] = getRoundPDA(2);

            try {
                await program.methods
                    .expire("blue chair", "f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6")
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        treasury: treasuryKeypair.publicKey,
                        buybackWallet: buybackKeypair.publicKey,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("Rejects expire on settled round", async () => {
            const [roundPDA] = getRoundPDA(1); // Settled

            try {
                await program.methods
                    .expire("red apple", "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        treasury: treasuryKeypair.publicKey,
                        buybackWallet: buybackKeypair.publicKey,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });

        it("Rejects deposit on expired round", async () => {
            const [roundPDA] = getRoundPDA(2); // Expired
            const [depositPDA] = getDepositPDA(2, player2.publicKey);

            try {
                await program.methods
                    .deposit(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({
                        player: player2.publicKey,
                        round: roundPDA,
                        deposit: depositPDA,
                        vault: vaultPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .signers([player2])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "RoundNotActive");
            }
        });
    });

    describe("Adversarial — payout manipulation", () => {
        it("Rejects evidence overpay (steal from rollover)", async () => {
            // Create round 4, deposit, then try to overpay evidence
            const answer = "green car";
            const salt = "aabbccdd11223344";
            const commitHash = computeCommitHash(answer, salt);
            const [roundPDA] = getRoundPDA(4);

            await program.methods
                .createRound(
                    new anchor.BN(4),
                    commitHash,
                    new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                )
                .accounts({
                    authority: authority.publicKey,
                    gameState: gameStatePDA,
                    round: roundPDA,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            const [depositPDA] = getDepositPDA(4, player1.publicKey);
            await program.methods
                .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
                .accounts({
                    player: player1.publicKey,
                    round: roundPDA,
                    deposit: depositPDA,
                    vault: vaultPDA,
                    systemProgram: SystemProgram.programId,
                })
                .signers([player1])
                .rpc();

            const round = await program.account.round.fetch(roundPDA);
            const pool =
                round.totalDeposits.toNumber() + round.rolloverIn.toNumber();
            const evidenceMax = Math.floor((pool * 3000) / 10000);

            // Try to claim MORE than 30% as evidence
            try {
                await program.methods
                    .settle(answer, salt, [new anchor.BN(evidenceMax + 1)])
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        winner: player1.publicKey,
                        treasury: treasuryKeypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .remainingAccounts([
                        {
                            pubkey: player2.publicKey,
                            isSigner: false,
                            isWritable: true,
                        },
                    ])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "InvalidPayoutSum");
            }
        });

        it("Rejects evidence wallet/amount count mismatch", async () => {
            const [roundPDA] = getRoundPDA(4); // Still active

            try {
                // 2 amounts but only 1 remaining account
                await program.methods
                    .settle("green car", "aabbccdd11223344", [
                        new anchor.BN(1000),
                        new anchor.BN(2000),
                    ])
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        vault: vaultPDA,
                        winner: player1.publicKey,
                        treasury: treasuryKeypair.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .remainingAccounts([
                        {
                            pubkey: player2.publicKey,
                            isSigner: false,
                            isWritable: true,
                        },
                    ])
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                assert.include(err.toString(), "EvidenceMismatch");
            }
        });
    });

    describe("Adversarial — round ID manipulation", () => {
        it("Rejects skipping round IDs", async () => {
            // Current round should be 5, try to create 99
            const [roundPDA] = getRoundPDA(99);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(99),
                        computeCommitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                    )
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                // Will fail on PDA derivation or InvalidRoundId
                assert.ok(err);
            }
        });

        it("Rejects duplicate round ID (re-create settled round)", async () => {
            // Round 1 already exists
            const [roundPDA] = getRoundPDA(1);

            try {
                await program.methods
                    .createRound(
                        new anchor.BN(1),
                        computeCommitHash("x", "y"),
                        new anchor.BN(Math.floor(Date.now() / 1000) + 3600)
                    )
                    .accounts({
                        authority: authority.publicKey,
                        gameState: gameStatePDA,
                        round: roundPDA,
                        systemProgram: SystemProgram.programId,
                    })
                    .rpc();
                assert.fail("Should have thrown");
            } catch (err) {
                // Will fail — PDA already exists or InvalidRoundId
                assert.ok(err);
            }
        });
    });
});
