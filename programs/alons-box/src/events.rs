use anchor_lang::prelude::*;

#[event]
pub struct GameInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub buyback_wallet: Pubkey,
}

#[event]
pub struct RoundCreated {
    pub round_id: u64,
    pub ends_at: i64,
    pub rollover_in: u64,
}

#[event]
pub struct DepositMade {
    pub round_id: u64,
    pub player: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
}

#[event]
pub struct RoundSettled {
    pub round_id: u64,
    pub winner: Pubkey,
    pub pool: u64,
    pub winner_amount: u64,
    pub evidence_total: u64,
    pub treasury_amount: u64,
}

#[event]
pub struct RoundExpired {
    pub round_id: u64,
    pub pool: u64,
    pub buyback_amount: u64,
    pub treasury_amount: u64,
}

#[event]
pub struct EmergencyExpired {
    pub round_id: u64,
    pub pool: u64,
    pub buyback_amount: u64,
    pub treasury_amount: u64,
    pub caller: Pubkey,
}

#[event]
pub struct DepositClosed {
    pub round_id: u64,
    pub player: Pubkey,
    pub rent_recovered: u64,
}

#[event]
pub struct RoundClosed {
    pub round_id: u64,
    pub rent_recovered: u64,
}
