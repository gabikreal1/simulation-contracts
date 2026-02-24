use anchor_lang::prelude::*;
use crate::errors::AlonsBoxError;
use crate::events::DepositClosed;
use crate::state::*;

#[derive(Accounts)]
pub struct CloseDeposit<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"game_state"],
        bump = game_state.bump,
        constraint = game_state.authority == authority.key() @ AlonsBoxError::Unauthorized,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        seeds = [b"round", round.round_id.to_le_bytes().as_ref()],
        bump = round.bump,
        constraint = round.status != RoundStatus::Active @ AlonsBoxError::RoundStillActive,
    )]
    pub round: Account<'info, Round>,

    #[account(
        mut,
        close = authority,
        seeds = [
            b"deposit",
            deposit.round_id.to_le_bytes().as_ref(),
            deposit.user.as_ref(),
        ],
        bump = deposit.bump,
        constraint = deposit.round_id == round.round_id,
    )]
    pub deposit: Account<'info, Deposit>,
}

pub fn handler(ctx: Context<CloseDeposit>) -> Result<()> {
    let rent = ctx.accounts.deposit.to_account_info().lamports();

    emit!(DepositClosed {
        round_id: ctx.accounts.deposit.round_id,
        player: ctx.accounts.deposit.user,
        rent_recovered: rent,
    });

    Ok(())
}
