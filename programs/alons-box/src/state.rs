use anchor_lang::prelude::*;

// ── GameState PDA ── seeds: ["game_state"]
#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub buyback_wallet: Pubkey,
    pub current_round_id: u64,
    pub bump: u8,
    pub rollover_balance: u64,
}

impl GameState {
    pub const SIZE: usize = 8 + 32 + 32 + 32 + 8 + 1 + 8;
}

// ── Round status enum ──
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum RoundStatus {
    Active,
    Settled,
    Expired,
}

// ── Round PDA ── seeds: ["round", round_id (u64 LE)]
#[account]
pub struct Round {
    pub round_id: u64,
    pub commit_hash: [u8; 32],
    pub authority: Pubkey,
    pub ends_at: i64,
    pub status: RoundStatus,
    pub total_deposits: u64,
    pub rollover_in: u64,
    pub revealed_answer: String,
    pub revealed_salt: String,
    pub bump: u8,
}

impl Round {
    // 8 disc + 8 + 32 + 32 + 8 + 1 + 8 + 8 + (4+64) + (4+64) + 1 = 242
    pub const SIZE: usize = 8 + 8 + 32 + 32 + 8 + 1 + 8 + 8 + (4 + 64) + (4 + 64) + 1;
}

// ── Deposit PDA ── seeds: ["deposit", round_id (u64 LE), user pubkey]
#[account]
pub struct Deposit {
    pub round_id: u64,
    pub user: Pubkey,
    pub amount: u64,
    pub bump: u8,
}

impl Deposit {
    pub const SIZE: usize = 8 + 8 + 32 + 8 + 1;
}

// ── Vault PDA ── seeds: ["vault"]
// Holds all SOL for the program
#[account]
pub struct Vault {
    pub bump: u8,
}

impl Vault {
    pub const SIZE: usize = 8 + 1;
}
