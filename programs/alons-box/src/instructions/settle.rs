use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use crate::errors::AlonsBoxError;
use crate::events::RoundSettled;
use crate::state::*;
use crate::utils::transfer_from_vault;

#[derive(Accounts)]
pub struct Settle<'info> {
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

    /// CHECK: Winner wallet — receives 50% of pool
    #[account(mut)]
    pub winner: AccountInfo<'info>,

    /// CHECK: Treasury — receives 5% of pool
    #[account(
        mut,
        constraint = treasury.key() == game_state.treasury @ AlonsBoxError::Unauthorized,
    )]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    // remaining_accounts: evidence wallets (writable, unchecked)
}

pub fn handler<'a>(
    ctx: Context<'_, '_, 'a, 'a, Settle<'a>>,
    answer: String,
    salt: String,
    evidence_amounts: Vec<u64>,
) -> Result<()> {
    require!(answer.len() <= 64, AlonsBoxError::AnswerTooLong);
    require!(salt.len() <= 64, AlonsBoxError::SaltTooLong);

    // ── Verify commit hash ──
    let commit_input = format!("{}:{}", answer, salt);
    let computed_hash = hash(commit_input.as_bytes());
    require!(
        computed_hash.to_bytes() == ctx.accounts.round.commit_hash,
        AlonsBoxError::InvalidCommitHash
    );

    // ── Verify evidence accounts match amounts ──
    require!(
        ctx.remaining_accounts.len() == evidence_amounts.len(),
        AlonsBoxError::EvidenceMismatch
    );

    // ── Calculate pool and payouts (BPS) ──
    let round = &ctx.accounts.round;
    let pool = round
        .total_deposits
        .checked_add(round.rollover_in)
        .ok_or(AlonsBoxError::MathOverflow)?;

    let winner_amount = pool
        .checked_mul(5000)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    let evidence_pool = pool
        .checked_mul(3000)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    let treasury_amount = pool
        .checked_mul(500)
        .ok_or(AlonsBoxError::MathOverflow)?
        .checked_div(10000)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // Verify evidence doesn't exceed 30% (F-01: use checked arithmetic)
    let total_evidence: u64 = evidence_amounts
        .iter()
        .try_fold(0u64, |acc, &x| acc.checked_add(x))
        .ok_or(AlonsBoxError::MathOverflow)?;
    require!(total_evidence <= evidence_pool, AlonsBoxError::InvalidPayoutSum);

    // ── Distribute from vault (program-owned PDA) ──
    let vault_info = ctx.accounts.vault.to_account_info();

    // Winner (50%)
    transfer_from_vault(&vault_info, &ctx.accounts.winner, winner_amount)?;

    // Evidence wallets (up to 30%)
    for (i, evidence_wallet) in ctx.remaining_accounts.iter().enumerate() {
        if evidence_amounts[i] > 0 {
            transfer_from_vault(&vault_info, evidence_wallet, evidence_amounts[i])?;
        }
    }

    // Treasury (5%)
    transfer_from_vault(&vault_info, &ctx.accounts.treasury, treasury_amount)?;

    // Remaining 15% + any unclaimed evidence stays in vault as rollover

    // ── Update round state ──
    let round = &mut ctx.accounts.round;
    round.status = RoundStatus::Settled;
    round.revealed_answer = answer;
    round.revealed_salt = salt;

    emit!(RoundSettled {
        round_id: round.round_id,
        winner: ctx.accounts.winner.key(),
        pool,
        winner_amount,
        evidence_total: total_evidence,
        treasury_amount,
    });

    Ok(())
}
