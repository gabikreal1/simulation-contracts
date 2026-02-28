use anchor_lang::prelude::*;
use crate::events::GameInitialized;
use crate::state::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = GameState::SIZE,
        seeds = [b"game_state"],
        bump,
    )]
    pub game_state: Account<'info, GameState>,

    #[account(
        init,
        payer = authority,
        space = Vault::SIZE,
        seeds = [b"vault"],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Initialize>, treasury: Pubkey, buyback_wallet: Pubkey) -> Result<()> {
    let game_state = &mut ctx.accounts.game_state;
    game_state.authority = ctx.accounts.authority.key();
    game_state.treasury = treasury;
    game_state.buyback_wallet = buyback_wallet;
    game_state.current_round_id = 0;
    game_state.bump = ctx.bumps.game_state;
    game_state.rollover_balance = 0;

    let vault = &mut ctx.accounts.vault;
    vault.bump = ctx.bumps.vault;

    emit!(GameInitialized {
        authority: game_state.authority,
        treasury,
        buyback_wallet,
    });

    Ok(())
}
