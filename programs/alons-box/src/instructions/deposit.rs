use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::errors::AlonsBoxError;
use crate::events::DepositMade;
use crate::state::*;

#[derive(Accounts)]
pub struct DepositCtx<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(
        mut,
        seeds = [b"round", round.round_id.to_le_bytes().as_ref()],
        bump = round.bump,
        constraint = round.status == RoundStatus::Active @ AlonsBoxError::RoundNotActive,
    )]
    pub round: Account<'info, Round>,

    #[account(
        init_if_needed,
        payer = player,
        space = Deposit::SIZE,
        seeds = [
            b"deposit",
            round.round_id.to_le_bytes().as_ref(),
            player.key().as_ref(),
        ],
        bump,
    )]
    pub deposit: Account<'info, Deposit>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositCtx>, amount: u64) -> Result<()> {
    // Transfer SOL from player → vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.player.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount,
    )?;

    // Update deposit PDA
    let deposit = &mut ctx.accounts.deposit;

    // F-17: Set static fields only on first deposit (account was just created)
    // When init_if_needed creates the account, all fields are zeroed.
    // On subsequent deposits, these fields are already set correctly.
    // The PDA seeds already guarantee the correct round_id and player,
    // so these writes are safe but unnecessary after the first deposit.
    if deposit.user == Pubkey::default() {
        deposit.round_id = ctx.accounts.round.round_id;
        deposit.user = ctx.accounts.player.key();
        deposit.bump = ctx.bumps.deposit;
    }

    deposit.amount = deposit
        .amount
        .checked_add(amount)
        .ok_or(AlonsBoxError::MathOverflow)?;

    // Update round total
    let round = &mut ctx.accounts.round;
    round.total_deposits = round
        .total_deposits
        .checked_add(amount)
        .ok_or(AlonsBoxError::MathOverflow)?;

    emit!(DepositMade {
        round_id: round.round_id,
        player: ctx.accounts.player.key(),
        amount,
        total_deposits: round.total_deposits,
    });

    Ok(())
}
