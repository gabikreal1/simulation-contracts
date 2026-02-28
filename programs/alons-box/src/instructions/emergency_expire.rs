use anchor_lang::prelude::*;
use crate::errors::AlonsBoxError;
use crate::events::EmergencyExpired;
use crate::state::*;
use crate::utils::transfer_from_vault;

#[derive(Accounts)]
pub struct EmergencyExpire<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"game_state"],
        bump = game_state.bump,
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

pub fn handler(ctx: Context<EmergencyExpire>) -> Result<()> {
    let clock = Clock::get()?;
    let round = &ctx.accounts.round;

    // Only callable 24 hours after ends_at
    let grace_deadline = round
        .ends_at
        .checked_add(86400)
        .ok_or(AlonsBoxError::MathOverflow)?;
    require!(
        clock.unix_timestamp > grace_deadline,
        AlonsBoxError::GracePeriodNotElapsed
    );

    // Calculate payouts from current deposits only (old rollover untouched)
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

    // Distribute from vault
    let vault_info = ctx.accounts.vault.to_account_info();
    transfer_from_vault(&vault_info, &ctx.accounts.buyback_wallet, buyback_amount)?;
    transfer_from_vault(&vault_info, &ctx.accounts.treasury, treasury_amount)?;

    // Update rollover and mark as expired (no answer reveal — answer is forfeit in emergency)
    ctx.accounts.game_state.rollover_balance = rollover_out;

    let round = &mut ctx.accounts.round;
    round.status = RoundStatus::Expired;

    let pool = total_deposits
        .checked_add(rollover_in)
        .ok_or(AlonsBoxError::MathOverflow)?;

    emit!(EmergencyExpired {
        round_id: round.round_id,
        pool,
        buyback_amount,
        treasury_amount,
        rollover_out,
        caller: ctx.accounts.caller.key(),
    });

    Ok(())
}
