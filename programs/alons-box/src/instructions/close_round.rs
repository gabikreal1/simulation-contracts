use anchor_lang::prelude::*;
use crate::errors::AlonsBoxError;
use crate::events::RoundClosed;
use crate::state::*;

#[derive(Accounts)]
pub struct CloseRound<'info> {
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
        close = authority,
        seeds = [b"round", round.round_id.to_le_bytes().as_ref()],
        bump = round.bump,
        constraint = round.status != RoundStatus::Active @ AlonsBoxError::RoundStillActive,
    )]
    pub round: Account<'info, Round>,
}

pub fn handler(ctx: Context<CloseRound>) -> Result<()> {
    let rent = ctx.accounts.round.to_account_info().lamports();

    emit!(RoundClosed {
        round_id: ctx.accounts.round.round_id,
        rent_recovered: rent,
    });

    Ok(())
}
