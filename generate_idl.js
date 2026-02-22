#!/usr/bin/env node
// Generates IDL and TypeScript types for Anchor 0.30.x
// Workaround for anchor-syn source_file compatibility issue
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PROGRAM_ID = "FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1";

function sighash(namespace, name) {
    const preimage = `${namespace}:${name}`;
    return Array.from(
        crypto.createHash("sha256").update(preimage).digest().slice(0, 8)
    );
}

const idl = {
    address: PROGRAM_ID,
    metadata: {
        name: "alons_box",
        version: "0.1.0",
        spec: "0.1.0",
        description: "Anchor smart contract for Alon's Box game",
    },
    instructions: [
        {
            name: "initialize",
            discriminator: sighash("global", "initialize"),
            accounts: [
                { name: "authority", writable: true, signer: true },
                { name: "gameState", writable: true },
                { name: "vault", writable: true },
                { name: "systemProgram" },
            ],
            args: [
                { name: "treasury", type: "pubkey" },
                { name: "buybackWallet", type: "pubkey" },
            ],
        },
        {
            name: "createRound",
            discriminator: sighash("global", "create_round"),
            accounts: [
                { name: "authority", writable: true, signer: true },
                { name: "gameState", writable: true },
                { name: "round", writable: true },
                { name: "vault" },
                { name: "systemProgram" },
            ],
            args: [
                { name: "roundId", type: "u64" },
                { name: "commitHash", type: { array: ["u8", 32] } },
                { name: "endsAt", type: "i64" },
            ],
        },
        {
            name: "deposit",
            discriminator: sighash("global", "deposit"),
            accounts: [
                { name: "player", writable: true, signer: true },
                { name: "round", writable: true },
                { name: "deposit", writable: true },
                { name: "vault", writable: true },
                { name: "systemProgram" },
            ],
            args: [{ name: "amount", type: "u64" }],
        },
        {
            name: "settle",
            discriminator: sighash("global", "settle"),
            accounts: [
                { name: "authority", writable: true, signer: true },
                { name: "gameState" },
                { name: "round", writable: true },
                { name: "vault", writable: true },
                { name: "winner", writable: true },
                { name: "treasury", writable: true },
                { name: "systemProgram" },
            ],
            args: [
                { name: "answer", type: "string" },
                { name: "salt", type: "string" },
                { name: "evidenceAmounts", type: { vec: "u64" } },
            ],
        },
        {
            name: "expire",
            discriminator: sighash("global", "expire"),
            accounts: [
                { name: "authority", writable: true, signer: true },
                { name: "gameState" },
                { name: "round", writable: true },
                { name: "vault", writable: true },
                { name: "treasury", writable: true },
                { name: "buybackWallet", writable: true },
            ],
            args: [
                { name: "answer", type: "string" },
                { name: "salt", type: "string" },
            ],
        },
    ],
    accounts: [
        {
            name: "gameState",
            discriminator: sighash("account", "GameState"),
        },
        {
            name: "round",
            discriminator: sighash("account", "Round"),
        },
        {
            name: "deposit",
            discriminator: sighash("account", "Deposit"),
        },
        {
            name: "vault",
            discriminator: sighash("account", "Vault"),
        },
    ],
    errors: [
        { code: 6000, name: "unauthorized", msg: "Unauthorized: caller is not the authority" },
        { code: 6001, name: "roundNotActive", msg: "Round is not active" },
        { code: 6002, name: "invalidCommitHash", msg: "Invalid commit hash: SHA-256 mismatch" },
        { code: 6003, name: "invalidPayoutSum", msg: "Invalid payout sum: evidence amounts exceed 30% pool" },
        { code: 6004, name: "mathOverflow", msg: "Math overflow" },
        { code: 6005, name: "answerTooLong", msg: "Answer too long (max 64 bytes)" },
        { code: 6006, name: "saltTooLong", msg: "Salt too long (max 64 bytes)" },
        { code: 6007, name: "evidenceMismatch", msg: "Evidence wallets count != evidence amounts count" },
        { code: 6008, name: "invalidRoundId", msg: "Invalid round ID" },
    ],
    types: [
        {
            name: "gameState",
            type: {
                kind: "struct",
                fields: [
                    { name: "authority", type: "pubkey" },
                    { name: "treasury", type: "pubkey" },
                    { name: "buybackWallet", type: "pubkey" },
                    { name: "currentRoundId", type: "u64" },
                    { name: "bump", type: "u8" },
                ],
            },
        },
        {
            name: "round",
            type: {
                kind: "struct",
                fields: [
                    { name: "roundId", type: "u64" },
                    { name: "commitHash", type: { array: ["u8", 32] } },
                    { name: "authority", type: "pubkey" },
                    { name: "endsAt", type: "i64" },
                    { name: "status", type: { defined: { name: "roundStatus" } } },
                    { name: "totalDeposits", type: "u64" },
                    { name: "rolloverIn", type: "u64" },
                    { name: "revealedAnswer", type: "string" },
                    { name: "revealedSalt", type: "string" },
                    { name: "bump", type: "u8" },
                ],
            },
        },
        {
            name: "deposit",
            type: {
                kind: "struct",
                fields: [
                    { name: "roundId", type: "u64" },
                    { name: "user", type: "pubkey" },
                    { name: "amount", type: "u64" },
                    { name: "bump", type: "u8" },
                ],
            },
        },
        {
            name: "vault",
            type: {
                kind: "struct",
                fields: [{ name: "bump", type: "u8" }],
            },
        },
        {
            name: "roundStatus",
            type: {
                kind: "enum",
                variants: [
                    { name: "active" },
                    { name: "settled" },
                    { name: "expired" },
                ],
            },
        },
    ],
};

// Write IDL
const idlDir = path.join(__dirname, "target", "idl");
fs.mkdirSync(idlDir, { recursive: true });
fs.writeFileSync(
    path.join(idlDir, "alons_box.json"),
    JSON.stringify(idl, null, 2)
);
console.log("✅ IDL written to target/idl/alons_box.json");

// Generate TypeScript types
const tsTypes = `/**
 * Program IDL in camelCase format (auto-generated)
 *
 * Note: This is a manually generated IDL for Anchor 0.30.x compatibility.
 */
export type AlonsBox = ${JSON.stringify(idl, null, 2)};
`;

const typesDir = path.join(__dirname, "target", "types");
fs.mkdirSync(typesDir, { recursive: true });
fs.writeFileSync(path.join(typesDir, "alons_box.ts"), tsTypes);
console.log("✅ Types written to target/types/alons_box.ts");
