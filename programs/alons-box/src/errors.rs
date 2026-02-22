use anchor_lang::prelude::*;

#[error_code]
pub enum AlonsBoxError {
    #[msg("Unauthorized: caller is not the authority")]
    Unauthorized,
    #[msg("Round is not active")]
    RoundNotActive,
    #[msg("Invalid commit hash: SHA-256 mismatch")]
    InvalidCommitHash,
    #[msg("Invalid payout sum: evidence amounts exceed 30% pool")]
    InvalidPayoutSum,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Answer too long (max 64 bytes)")]
    AnswerTooLong,
    #[msg("Salt too long (max 64 bytes)")]
    SaltTooLong,
    #[msg("Evidence wallets count != evidence amounts count")]
    EvidenceMismatch,
    #[msg("Invalid round ID")]
    InvalidRoundId,
}
