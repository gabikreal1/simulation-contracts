use anchor_lang::prelude::*;
use crate::errors::AlonsBoxError;
use crate::events::RoundCreated;
use crate::state::*;

#[derive(Accounts)]
#[instruction(round_id: u64)]
pub struct CreateRound<'info> {
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
        init,
        payer = authority,
        space = Round::SIZE,
        seeds = [b"round", round_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub round: Account<'info, Round>,

    #[account(
        seeds = [b"vault"],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateRound>,
    round_id: u64,
    commit_hash: [u8; 32],
    ends_at: i64,
) -> Result<()> {
    let game_state = &mut ctx.accounts.game_state;

    // Validate round_id is the next sequential ID
    require!(
        round_id == game_state.current_round_id + 1,
        AlonsBoxError::InvalidRoundId
    );

    // F-05: Validate ends_at is in the future
    let clock = Clock::get()?;
    require!(ends_at > clock.unix_timestamp, AlonsBoxError::InvalidEndTime);

    game_state.current_round_id = round_id;

    // Calculate rollover: vault balance minus rent-exempt minimum
    let vault_lamports = ctx.accounts.vault.to_account_info().lamports();
    let vault_rent = Rent::get()?.minimum_balance(Vault::SIZE);
    let rollover = vault_lamports.saturating_sub(vault_rent);

    let round = &mut ctx.accounts.round;
    round.round_id = round_id;
    round.commit_hash = commit_hash;
    round.authority = ctx.accounts.authority.key();
    round.ends_at = ends_at;
    round.status = RoundStatus::Active;
    round.total_deposits = 0;
    round.rollover_in = rollover;
    round.revealed_answer = String::new();
    round.revealed_salt = String::new();
    round.bump = ctx.bumps.round;

    emit!(RoundCreated {
        round_id,
        ends_at,
        rollover_in: rollover,
    });

    Ok(())
}
