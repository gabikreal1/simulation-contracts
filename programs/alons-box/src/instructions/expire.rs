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
        mut,
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

    // ── Calculate payouts from current deposits only (old rollover untouched) ──
    let round = &ctx.accounts.round;
    let total_deposits = round.total_deposits;
    let rollover_in = round.rollover_in;

    // 47.5% buyback (4750 BPS) — from deposits only
    let buyback_amount = total_deposits
        .checked_mul(4750)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // 5% treasury (500 BPS) — from deposits only
    let treasury_amount = total_deposits
        .checked_mul(500)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // Residual absorbs rounding dust
    let rollover_added = total_deposits
        .checked_sub(buyback_amount)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_sub(treasury_amount)
        .ok_or(AlonsBoxError::MathOverflow)?;

    let rollover_out = rollover_in
        .checked_add(rollover_added)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // ── Distribute from vault (program-owned PDA) ──
    let vault_info = ctx.accounts.vault.to_account_info();

    // Buyback wallet (47.5% of deposits)
    transfer_from_vault(&vault_info, &ctx.accounts.buyback_wallet, buyback_amount)?;

    // Treasury (5% of deposits)
    transfer_from_vault(&vault_info, &ctx.accounts.treasury, treasury_amount)?;

    // ── Update rollover and round state ──
    ctx.accounts.game_state.rollover_balance = rollover_out;

    let round = &mut ctx.accounts.round;
    round.status = RoundStatus::Expired;
    round.revealed_answer = answer;
    round.revealed_salt = salt;

    let pool = total_deposits
        .checked_add(rollover_in)
        .ok_or(AlonsBoxError::MathOverflow)?;

    emit!(RoundExpired {
        round_id: round.round_id,
        pool,
        buyback_amount,
        treasury_amount,
        rollover_out,
    });

    Ok(())
}
