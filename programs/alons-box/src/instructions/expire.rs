use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use crate::errors::AlonsBoxError;
use crate::events::RoundExpired;
use crate::state::*;
use crate::utils::transfer_from_vault;

#[derive(Accounts)]
pub struct Expire<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump,
        constraint = game_state.authority == authority.key() @ AlonsBoxError::Unauthorized,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"round", round.round_id.to_le_bytes().as_ref()],
        bump = round.bump,
        constraint = round.status == RoundStatus::Active @ AlonsBoxError::RoundNotActive,
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Treasury — receives 5% of pool
    #[account(
        mut,
        constraint = treasury.key() == game_state.treasury @ AlonsBoxError::Unauthorized,
    )]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Buyback wallet — receives 47.5% of pool for $SIMULATION buyback
    #[account(
        mut,
        constraint = buyback_wallet.key() == game_state.buyback_wallet @ AlonsBoxError::Unauthorized,
    )]
    pub buyback_wallet: AccountInfo<'info>,
}

pub fn handler(ctx: Context<Expire>, answer: String, salt: String) -> Result<()> {
    require!(answer.len() <= 64, AlonsBoxError::AnswerTooLong);
    require!(salt.len() <= 64, AlonsBoxError::SaltTooLong);

    // Verify commit hash
    let commit_input = format!("{}:{}", answer, salt);
    let computed_hash = hash(commit_input.as_bytes());
    require!(
        computed_hash.to_bytes() == ctx.accounts.round.commit_hash,
        AlonsBoxError::InvalidCommitHash
    );

    // ── Calculate pool and payouts (BPS) ──
    let round = &ctx.accounts.round;
    let pool = round
        .total_deposits
        .checked_add(round.rollover_in)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // 47.5% buyback (4750 BPS)
    let buyback_amount = pool
        .checked_mul(4750)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // 5% treasury (500 BPS)
    let treasury_amount = pool
        .checked_mul(500)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // Remaining 47.5% stays in vault as rollover

    // ── Distribute from vault (program-owned PDA) ──
    let vault_info = ctx.accounts.vault.to_account_info();

    // Buyback wallet (47.5%)
    transfer_from_vault(&vault_info, &ctx.accounts.buyback_wallet, buyback_amount)?;

    // Treasury (5%)
    transfer_from_vault(&vault_info, &ctx.accounts.treasury, treasury_amount)?;

    // Mark as expired
    let round = &mut ctx.accounts.round;
    round.status = RoundStatus::Expired;
    round.revealed_answer = answer;
    round.revealed_salt = salt;

    emit!(RoundExpired {
        round_id: round.round_id,
        pool,
        buyback_amount,
        treasury_amount,
    });

    Ok(())
}
