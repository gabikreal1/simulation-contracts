use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("FMczpL5fdYdQhvTq7jKHkg5F9emaYHCYF8bdZJQbgnC1");

#[program]
pub mod alons_box {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, treasury: Pubkey, buyback_wallet: Pubkey) -> Result<()> {
        instructions::initialize::handler(ctx, treasury, buyback_wallet)
    }

    pub fn create_round(
        ctx: Context<CreateRound>,
        round_id: u64,
        commit_hash: [u8; 32],
        ends_at: i64,
    ) -> Result<()> {
        instructions::create_round::handler(ctx, round_id, commit_hash, ends_at)
    }

    pub fn deposit(ctx: Context<DepositCtx>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    pub fn settle<'info>(
        ctx: Context<'_, '_, 'info, 'info, Settle<'info>>,
        answer: String,
        salt: String,
        evidence_amounts: Vec<u64>,
    ) -> Result<()> {
        instructions::settle::handler(ctx, answer, salt, evidence_amounts)
    }

    pub fn expire(ctx: Context<Expire>, answer: String, salt: String) -> Result<()> {
        instructions::expire::handler(ctx, answer, salt)
    }
}
