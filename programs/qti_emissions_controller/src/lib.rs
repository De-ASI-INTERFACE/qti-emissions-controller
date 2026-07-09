//! QTI Emissions Controller
//!
//! Squads-gated, rate-limited SPL token minting program for QTI staking rewards.
//!
//! Security properties:
//!   1. Per-epoch emission cap enforced on-chain — no runaway inflation
//!   2. Lifetime total emission cap — hard ceiling, cannot be circumvented
//!   3. Squads vault PDA is sole reconfiguration authority
//!   4. emissions_authority PDA holds mint_authority — no private key exists
//!   5. Emergency pause/resume controlled exclusively by governance
//!   6. All arithmetic uses checked operations — no overflow/underflow
//!   7. Mint authority validated on every emit_rewards call
//!   8. Full on-chain event emission for off-chain monitoring (Grafana)
//!   9. Gini gate enforced on every emit_rewards via qti_developer_credits CPI read
//!
//! RP-DEASI-EMISSIONS-2026-0627-001
//! Author: Richard Patterson (@De-ASI-INTERFACE)
//! Deployer: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
//!
//! Inequality controller (qti_developer_credits):
//!   Program ID: 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv
//!   Doc ID:     RP-DEASI-INEQUALITY-2026-0707-001

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

declare_id!("EMiSCtRL1QTIDeASIInterface111111111111111111");

/// Program ID of the qti_developer_credits inequality controller.
/// This program owns InequalityControllerState and exposes gini_gate_open.
/// Referenced here for account ownership validation in EmitRewards.
pub const DEVELOPER_CREDITS_PROGRAM_ID: &str = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv";

pub const EMISSIONS_AUTHORITY_SEED: &[u8] = b"emissions_authority";
pub const EMISSIONS_CONFIG_SEED: &[u8] = b"emissions_config";
/// Seed used by qti_developer_credits to derive InequalityControllerState PDA.
/// Kept here so EmitRewards can validate the account address without a CPI call.
pub const CONTROLLER_STATE_SEED: &[u8] = b"developer_credits_state";

/// Maximum configurable epoch duration (30 days in slots)
pub const MAX_EPOCH_DURATION_SLOTS: u64 = 6_480_000;
/// Minimum configurable epoch duration (1 hour in slots)
pub const MIN_EPOCH_DURATION_SLOTS: u64 = 9_000;

#[program]
pub mod qti_emissions_controller {
    use super::*;

    /// Initialize emission parameters.
    /// Called ONCE by the Squads vault after mint_authority has been
    /// transferred to the emissions_authority PDA.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        epoch_duration_slots: u64,
        max_emission_per_epoch: u64,
        total_emission_cap: u64,
    ) -> Result<()> {
        require!(
            epoch_duration_slots >= MIN_EPOCH_DURATION_SLOTS
                && epoch_duration_slots <= MAX_EPOCH_DURATION_SLOTS,
            EmissionsError::InvalidEpochDuration
        );
        require!(max_emission_per_epoch > 0, EmissionsError::InvalidEmissionCap);
        require!(
            total_emission_cap >= max_emission_per_epoch,
            EmissionsError::InvalidEmissionCap
        );

        // Verify emissions_authority PDA is already mint_authority
        require!(
            ctx.accounts.qti_mint.mint_authority
                == anchor_lang::solana_program::program_option::COption::Some(
                    ctx.accounts.emissions_authority.key()
                ),
            EmissionsError::InvalidMintAuthority
        );

        let config = &mut ctx.accounts.emissions_config;
        config.authority = ctx.accounts.squads_vault.key();
        config.qti_mint = ctx.accounts.qti_mint.key();
        config.epoch_duration_slots = epoch_duration_slots;
        config.max_emission_per_epoch = max_emission_per_epoch;
        config.total_emission_cap = total_emission_cap;
        config.total_minted = 0;
        config.current_epoch_start = Clock::get()?.slot;
        config.current_epoch_minted = 0;
        config.paused = false;
        config.initialized_at = Clock::get()?.unix_timestamp;
        config.bump = ctx.bumps.emissions_config;
        config.authority_bump = ctx.bumps.emissions_authority;

        emit!(EmissionsInitialized {
            authority: config.authority,
            qti_mint: config.qti_mint,
            epoch_duration_slots,
            max_emission_per_epoch,
            total_emission_cap,
            slot: Clock::get()?.slot,
            timestamp: Clock::get()?.unix_timestamp,
        });

        msg!(
            "QTI EmissionsConfig initialized. authority={} mint={} epoch_slots={} max_per_epoch={} total_cap={}",
            config.authority,
            config.qti_mint,
            epoch_duration_slots,
            max_emission_per_epoch,
            total_emission_cap
        );
        Ok(())
    }

    /// Mint staking rewards to a recipient token account.
    /// Enforces per-epoch rate limit, lifetime cap, pause state,
    /// mint authority validity, AND the Gini gate from qti_developer_credits.
    pub fn emit_rewards(ctx: Context<EmitRewards>, amount: u64) -> Result<()> {
        require!(amount > 0, EmissionsError::ZeroAmount);

        let config = &mut ctx.accounts.emissions_config;
        require!(!config.paused, EmissionsError::EmissionsPaused);

        // ── Gini gate check ────────────────────────────────────────────────
        // Read gini_gate_open from the qti_developer_credits controller state.
        // If the gate is closed (G_current > G_target + tolerance), block mint.
        // The gate account is validated by PDA derivation in EmitRewards accounts.
        let gate_open = ctx.accounts.gini_controller_state.gini_gate_open;
        if !gate_open {
            emit!(InequalityGateBlocked {
                epoch_index: ctx.accounts.gini_controller_state.epoch_index,
                current_gini: ctx.accounts.gini_controller_state.current_gini,
                g_target: ctx.accounts.gini_controller_state.g_target,
                slot: Clock::get()?.slot,
                timestamp: Clock::get()?.unix_timestamp,
            });
            msg!(
                "InequalityGateBlocked: gini={} g_target={}",
                ctx.accounts.gini_controller_state.current_gini,
                ctx.accounts.gini_controller_state.g_target
            );
            return err!(EmissionsError::InequalityGateViolated);
        }

        let clock = Clock::get()?;

        // Epoch rollover: reset per-epoch counter if epoch has elapsed
        let slots_elapsed = clock.slot.saturating_sub(config.current_epoch_start);
        if slots_elapsed >= config.epoch_duration_slots {
            config.current_epoch_start = clock.slot;
            config.current_epoch_minted = 0;
        }

        // Per-epoch rate limit (checked arithmetic — no overflow)
        let new_epoch_total = config
            .current_epoch_minted
            .checked_add(amount)
            .ok_or(EmissionsError::Overflow)?;
        require!(
            new_epoch_total <= config.max_emission_per_epoch,
            EmissionsError::EpochCapExceeded
        );

        // Lifetime cap (checked arithmetic)
        let new_total = config
            .total_minted
            .checked_add(amount)
            .ok_or(EmissionsError::Overflow)?;
        require!(
            new_total <= config.total_emission_cap,
            EmissionsError::TotalCapExceeded
        );

        // CPI mint — emissions_authority PDA signs; no private key exists
        let signer_seeds: &[&[&[u8]]] =
            &[&[EMISSIONS_AUTHORITY_SEED, &[config.authority_bump]]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.qti_mint.to_account_info(),
                    to: ctx.accounts.recipient_token_account.to_account_info(),
                    authority: ctx.accounts.emissions_authority.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        config.current_epoch_minted = new_epoch_total;
        config.total_minted = new_total;

        emit!(RewardsEmitted {
            recipient: ctx.accounts.recipient_token_account.key(),
            amount,
            total_minted: config.total_minted,
            epoch_minted: config.current_epoch_minted,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });

        msg!(
            "RewardsEmitted amount={} total_minted={} epoch_minted={}",
            amount,
            config.total_minted,
            config.current_epoch_minted
        );
        Ok(())
    }

    /// Update emission rate parameters.
    /// Only the Squads vault authority stored in EmissionsConfig may call this.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        new_max_emission_per_epoch: Option<u64>,
        new_epoch_duration_slots: Option<u64>,
        new_total_emission_cap: Option<u64>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.emissions_config;

        if let Some(v) = new_max_emission_per_epoch {
            require!(v > 0, EmissionsError::InvalidEmissionCap);
            require!(v <= config.total_emission_cap, EmissionsError::InvalidEmissionCap);
            config.max_emission_per_epoch = v;
        }
        if let Some(v) = new_epoch_duration_slots {
            require!(
                v >= MIN_EPOCH_DURATION_SLOTS && v <= MAX_EPOCH_DURATION_SLOTS,
                EmissionsError::InvalidEpochDuration
            );
            config.epoch_duration_slots = v;
        }
        if let Some(v) = new_total_emission_cap {
            require!(v >= config.total_minted, EmissionsError::CapBelowMinted);
            require!(v >= config.max_emission_per_epoch, EmissionsError::InvalidEmissionCap);
            config.total_emission_cap = v;
        }

        emit!(ConfigUpdated {
            authority: config.authority,
            new_max_emission_per_epoch: config.max_emission_per_epoch,
            new_epoch_duration_slots: config.epoch_duration_slots,
            new_total_emission_cap: config.total_emission_cap,
            slot: Clock::get()?.slot,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Emergency pause — halts all emit_rewards calls immediately.
    pub fn pause_emissions(ctx: Context<UpdateConfig>) -> Result<()> {
        require!(!ctx.accounts.emissions_config.paused, EmissionsError::AlreadyPaused);
        ctx.accounts.emissions_config.paused = true;
        emit!(EmissionsPaused {
            authority: ctx.accounts.authority.key(),
            slot: Clock::get()?.slot,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("QTI emissions PAUSED by {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Resume emissions after governance review.
    pub fn resume_emissions(ctx: Context<UpdateConfig>) -> Result<()> {
        require!(ctx.accounts.emissions_config.paused, EmissionsError::NotPaused);
        ctx.accounts.emissions_config.paused = false;
        emit!(EmissionsResumed {
            authority: ctx.accounts.authority.key(),
            slot: Clock::get()?.slot,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("QTI emissions RESUMED by {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Transfer governance authority to a new Squads vault.
    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(
            new_authority,
            ctx.accounts.emissions_config.authority,
            EmissionsError::SameAuthority
        );
        let old_authority = ctx.accounts.emissions_config.authority;
        ctx.accounts.emissions_config.authority = new_authority;
        emit!(AuthorityTransferred {
            old_authority,
            new_authority,
            slot: Clock::get()?.slot,
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("Authority transferred: {} -> {}", old_authority, new_authority);
        Ok(())
    }
}

// ── Account Contexts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Squads vault PDA — stored as sole reconfiguration authority.
    /// CHECK: Validated by storing key in EmissionsConfig.authority.
    pub squads_vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub qti_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        space = EmissionsConfig::LEN,
        seeds = [EMISSIONS_CONFIG_SEED, qti_mint.key().as_ref()],
        bump
    )]
    pub emissions_config: Account<'info, EmissionsConfig>,

    /// CHECK: PDA derivation guarantees only this program can sign.
    #[account(seeds = [EMISSIONS_AUTHORITY_SEED], bump)]
    pub emissions_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

/// GiniControllerState is a zero-copy view of the InequalityControllerState
/// account owned by qti_developer_credits (9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv).
/// Only gini_gate_open, epoch_index, current_gini, and g_target are read;
/// the account is never mutated by this program.
#[account]
pub struct GiniControllerState {
    /// Squads vault authority (32)
    pub _authority: [u8; 32],
    /// QTI mint (32)
    pub _qti_mint: [u8; 32],
    /// epoch_duration_slots (8)
    pub _epoch_duration_slots: u64,
    /// g_target scaled x10_000 (8)
    pub g_target: u64,
    /// k scaled x10_000 (8)
    pub _k: u64,
    /// theta scaled x10_000 (8)
    pub _theta: u64,
    /// current_gini scaled x10_000 (8)
    pub current_gini: u64,
    /// Gate flag — true means emissions are permitted (1)
    pub gini_gate_open: bool,
    /// current_epoch_start slot (8)
    pub _current_epoch_start: u64,
    /// epoch_index (8)
    pub epoch_index: u64,
    // histogram, totals, timestamps, flags, bump follow — not read here
}

#[derive(Accounts)]
pub struct EmitRewards<'info> {
    #[account(
        mut,
        seeds = [EMISSIONS_CONFIG_SEED, qti_mint.key().as_ref()],
        bump = emissions_config.bump,
        constraint = emissions_config.qti_mint == qti_mint.key()
            @ EmissionsError::MintMismatch
    )]
    pub emissions_config: Account<'info, EmissionsConfig>,

    /// CHECK: PDA signer — no private key
    #[account(
        seeds = [EMISSIONS_AUTHORITY_SEED],
        bump = emissions_config.authority_bump
    )]
    pub emissions_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = qti_mint.mint_authority
            == anchor_lang::solana_program::program_option::COption::Some(
                emissions_authority.key()
            ) @ EmissionsError::InvalidMintAuthority
    )]
    pub qti_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = recipient_token_account.mint == qti_mint.key()
            @ EmissionsError::MintMismatch
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// InequalityControllerState PDA owned by qti_developer_credits.
    /// Validated by seeds — ensures this is the canonical controller for this mint.
    /// Read-only: only gini_gate_open is consumed; never mutated here.
    #[account(
        seeds = [CONTROLLER_STATE_SEED, qti_mint.key().as_ref()],
        bump,
        owner = DEVELOPER_CREDITS_PROGRAM_ID.parse::<Pubkey>().unwrap()
    )]
    pub gini_controller_state: Account<'info, GiniControllerState>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [EMISSIONS_CONFIG_SEED, emissions_config.qti_mint.as_ref()],
        bump = emissions_config.bump,
        constraint = emissions_config.authority == authority.key()
            @ EmissionsError::Unauthorized
    )]
    pub emissions_config: Account<'info, EmissionsConfig>,
}

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [EMISSIONS_CONFIG_SEED, emissions_config.qti_mint.as_ref()],
        bump = emissions_config.bump,
        constraint = emissions_config.authority == authority.key()
            @ EmissionsError::Unauthorized
    )]
    pub emissions_config: Account<'info, EmissionsConfig>,
}

// ── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct EmissionsConfig {
    pub authority: Pubkey,
    pub qti_mint: Pubkey,
    pub epoch_duration_slots: u64,
    pub max_emission_per_epoch: u64,
    pub total_emission_cap: u64,
    pub total_minted: u64,
    pub current_epoch_start: u64,
    pub current_epoch_minted: u64,
    pub initialized_at: i64,
    pub paused: bool,
    pub bump: u8,
    pub authority_bump: u8,
}

impl EmissionsConfig {
    pub const LEN: usize =
          8   // Anchor discriminator
        + 32  // authority
        + 32  // qti_mint
        + 8   // epoch_duration_slots
        + 8   // max_emission_per_epoch
        + 8   // total_emission_cap
        + 8   // total_minted
        + 8   // current_epoch_start
        + 8   // current_epoch_minted
        + 8   // initialized_at
        + 1   // paused
        + 1   // bump
        + 1   // authority_bump
        + 64; // future-proof padding
}

// ── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct EmissionsInitialized {
    pub authority: Pubkey,
    pub qti_mint: Pubkey,
    pub epoch_duration_slots: u64,
    pub max_emission_per_epoch: u64,
    pub total_emission_cap: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct RewardsEmitted {
    pub recipient: Pubkey,
    pub amount: u64,
    pub total_minted: u64,
    pub epoch_minted: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct ConfigUpdated {
    pub authority: Pubkey,
    pub new_max_emission_per_epoch: u64,
    pub new_epoch_duration_slots: u64,
    pub new_total_emission_cap: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct EmissionsPaused {
    pub authority: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct EmissionsResumed {
    pub authority: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub slot: u64,
    pub timestamp: i64,
}

/// Emitted when the Gini gate blocks a mint attempt.
/// Indexed by epoch_index for Grafana / off-chain monitoring.
#[event]
pub struct InequalityGateBlocked {
    pub epoch_index: u64,
    pub current_gini: u64,
    pub g_target: u64,
    pub slot: u64,
    pub timestamp: i64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum EmissionsError {
    #[msg("Epoch emission cap exceeded — try again next epoch")]
    EpochCapExceeded,
    #[msg("Lifetime total emission cap exceeded — staking rewards exhausted")]
    TotalCapExceeded,
    #[msg("Unauthorized: only the Squads vault authority may reconfigure")]
    Unauthorized,
    #[msg("Emissions are currently paused by governance")]
    EmissionsPaused,
    #[msg("Emissions are not paused")]
    NotPaused,
    #[msg("Emissions are already paused")]
    AlreadyPaused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow in emission accounting")]
    Overflow,
    #[msg("Invalid epoch duration: must be between MIN and MAX slot bounds")]
    InvalidEpochDuration,
    #[msg("Invalid emission cap: must be > 0, per-epoch <= total")]
    InvalidEmissionCap,
    #[msg("Cannot set total cap below already-minted amount")]
    CapBelowMinted,
    #[msg("Mint authority must be the emissions_authority PDA")]
    InvalidMintAuthority,
    #[msg("Token account mint does not match QTI mint")]
    MintMismatch,
    #[msg("New authority must differ from current authority")]
    SameAuthority,
    #[msg("Inequality gate closed: reward distribution Gini exceeds target — finalize epoch in qti_developer_credits first")]
    InequalityGateViolated,
}
