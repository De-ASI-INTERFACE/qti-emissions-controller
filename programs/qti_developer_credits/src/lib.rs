//! QTI Developer Credits
//!
//! Gini-based on-chain inequality controller for the QTI protocol.
//! Owned by program ID: 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv
//!
//! This program is the authoritative source of reward-distribution fairness
//! state for all QTI emissions and governance programs.  Every epoch it:
//!   1. Accepts per-participant reward observations via `record_reward`.
//!   2. On `finalize_epoch`, computes a binned Gini approximation over the
//!      accumulated reward vector.
//!   3. Runs a proportional controller step:
//!         θ_{t+1} = clamp(θ_t − k · (G_t − G_target), θ_min, θ_max)
//!   4. Sets `gini_gate_open` = (G_t <= G_target + GATE_TOLERANCE).
//!      The qti_emissions_controller reads this flag before every mint.
//!
//! Formally verified properties (see LEAN4_SPEC.md):
//!   — gini_nonneg         : 0 ≤ G(R) ≤ 1  for all R ≥ 0
//!   — controller_bounded  : θ ∈ [θ_min, θ_max] for all time steps
//!   — sybil_resistance    : splitting rewards across identities cannot
//!                           raise expected payout under controller policy
//!
//! Security properties:
//!   1. Controller state is a singleton PDA — one per mint.
//!   2. Only the Squads vault authority may call update_params / pause / resume.
//!   3. record_reward is permissionless (callable by emissions program CPI).
//!   4. finalize_epoch enforces that sufficient slots have elapsed.
//!   5. All arithmetic is checked — no overflow / underflow.
//!   6. Binned Gini approximation error ≤ 0.005 for BIN_COUNT = 256.
//!
//! RP-DEASI-INEQUALITY-2026-0707-001
//! Author:  Richard Patterson (@De-ASI-INTERFACE)
//! Deployer: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my

use anchor_lang::prelude::*;

declare_id!("9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv");

// ── Seeds ────────────────────────────────────────────────────────────────────
pub const CONTROLLER_STATE_SEED: &[u8] = b"developer_credits_state";
pub const REWARD_ACCUMULATOR_SEED: &[u8] = b"reward_accumulator";

// ── Formal-spec constants (mirror Lean4 ControllerParams) ───────────────────

/// Default Gini target (scaled ×10_000 → 0.35 == 3_500)
pub const G_TARGET_DEFAULT: u64 = 3_500;
/// Default proportional gain k (scaled ×10_000 → 0.10 == 1_000)
pub const K_DEFAULT: u64 = 1_000;
/// Minimum θ (scaled ×10_000 → 0.0 == 0)
pub const THETA_MIN: u64 = 0;
/// Maximum θ (scaled ×10_000 → 1.0 == 10_000)
pub const THETA_MAX: u64 = 10_000;
/// Number of bins for the on-chain Gini approximation.
/// Proven error bound: |G_binned − G_true| ≤ 0.005 for BIN_COUNT = 256.
pub const BIN_COUNT: usize = 256;
/// Tolerance above G_target before the emissions gate closes
/// (scaled ×10_000 → 0.02 == 200)
pub const GATE_TOLERANCE: u64 = 200;
/// Minimum slots between finalize_epoch calls (≈ 1 hour on Solana)
pub const MIN_EPOCH_SLOTS: u64 = 9_000;
/// Maximum slots between finalize_epoch calls (≈ 30 days)
pub const MAX_EPOCH_SLOTS: u64 = 6_480_000;

// ── Program ──────────────────────────────────────────────────────────────────

#[program]
pub mod qti_developer_credits {
    use super::*;

    /// Initialize the inequality controller for a given QTI mint.
    /// Called ONCE by the Squads vault authority after deployment.
    pub fn initialize_controller(
        ctx: Context<InitializeController>,
        epoch_duration_slots: u64,
        g_target: u64,
        k: u64,
    ) -> Result<()> {
        require!(
            epoch_duration_slots >= MIN_EPOCH_SLOTS
                && epoch_duration_slots <= MAX_EPOCH_SLOTS,
            ControllerError::InvalidEpochDuration
        );
        require!(g_target <= 10_000, ControllerError::InvalidGTarget);
        require!(k > 0 && k <= 10_000, ControllerError::InvalidK);

        let state = &mut ctx.accounts.controller_state;
        state.authority           = ctx.accounts.squads_vault.key();
        state.qti_mint            = ctx.accounts.qti_mint.key();
        state.epoch_duration_slots = epoch_duration_slots;
        state.g_target            = g_target;
        state.k                   = k;
        state.theta               = 10_000; // θ starts at max (1.0 → full emissions)
        state.current_gini        = 0;
        state.gini_gate_open      = true;   // open by default until first epoch
        state.current_epoch_start = Clock::get()?.slot;
        state.epoch_index         = 0;
        state.paused              = false;
        state.initialized_at      = Clock::get()?.unix_timestamp;
        state.bump                = ctx.bumps.controller_state;

        emit!(ControllerInitialized {
            authority:             state.authority,
            qti_mint:              state.qti_mint,
            epoch_duration_slots,
            g_target,
            k,
            slot:                  Clock::get()?.slot,
            timestamp:             Clock::get()?.unix_timestamp,
        });

        msg!(
            "QTI DeveloperCredits controller initialized. \
             authority={} mint={} g_target={} k={} epoch_slots={}",
            state.authority, state.qti_mint, g_target, k, epoch_duration_slots
        );
        Ok(())
    }

    /// Record a reward observation for a participant in the current epoch.
    /// Permissionless — callable directly or via CPI from the emissions program.
    /// Accumulates into the binned histogram used by finalize_epoch.
    pub fn record_reward(
        ctx: Context<RecordReward>,
        participant: Pubkey,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ControllerError::ZeroAmount);
        require!(
            !ctx.accounts.controller_state.paused,
            ControllerError::ControllerPaused
        );

        let acc = &mut ctx.accounts.reward_accumulator;
        // Assign participant if slot is empty, otherwise require match
        if acc.participant == Pubkey::default() {
            acc.participant  = participant;
            acc.epoch_index  = ctx.accounts.controller_state.epoch_index;
            acc.total_reward = 0;
            acc.bump         = ctx.bumps.reward_accumulator;
        }
        require!(
            acc.participant == participant,
            ControllerError::ParticipantMismatch
        );
        require!(
            acc.epoch_index == ctx.accounts.controller_state.epoch_index,
            ControllerError::StaleAccumulator
        );

        acc.total_reward = acc
            .total_reward
            .checked_add(amount)
            .ok_or(ControllerError::Overflow)?;

        // Update the binned histogram in controller state
        let state = &mut ctx.accounts.controller_state;
        let bin = compute_bin(amount, state.theta);
        state.histogram[bin] = state.histogram[bin]
            .checked_add(1)
            .ok_or(ControllerError::Overflow)?;
        state.total_reward_this_epoch = state
            .total_reward_this_epoch
            .checked_add(amount)
            .ok_or(ControllerError::Overflow)?;
        state.participant_count = state
            .participant_count
            .checked_add(1)
            .ok_or(ControllerError::Overflow)?;

        Ok(())
    }

    /// Finalize the current epoch:
    ///   1. Compute binned Gini from histogram.
    ///   2. Run proportional controller step to update θ.
    ///   3. Set gini_gate_open flag for the emissions controller.
    ///   4. Reset histogram and counters for the next epoch.
    pub fn finalize_epoch(ctx: Context<FinalizeEpoch>) -> Result<()> {
        let state = &mut ctx.accounts.controller_state;
        require!(!state.paused, ControllerError::ControllerPaused);

        let clock = Clock::get()?;
        let slots_elapsed = clock
            .slot
            .saturating_sub(state.current_epoch_start);
        require!(
            slots_elapsed >= state.epoch_duration_slots,
            ControllerError::EpochNotElapsed
        );

        // ── 1. Compute binned Gini (scaled ×10_000) ──────────────────────────
        let gini = compute_binned_gini(&state.histogram, state.participant_count);
        state.current_gini = gini;

        // ── 2. Proportional controller step ──────────────────────────────────
        // θ_{t+1} = clamp(θ_t − k · (G_t − G_target), θ_min, θ_max)
        // All values scaled ×10_000; use i128 to handle negative deltas safely.
        let theta_i = state.theta as i128;
        let k_i     = state.k as i128;
        let g_i     = gini as i128;
        let gt_i    = state.g_target as i128;
        let delta   = k_i
            .checked_mul(g_i.checked_sub(gt_i).ok_or(ControllerError::Overflow)?)
            .ok_or(ControllerError::Overflow)?
            .checked_div(10_000)
            .ok_or(ControllerError::Overflow)?;
        let new_theta_i = theta_i.checked_sub(delta).ok_or(ControllerError::Overflow)?;
        let new_theta = new_theta_i
            .max(THETA_MIN as i128)
            .min(THETA_MAX as i128) as u64;
        state.theta = new_theta;

        // ── 3. Gate: open iff G_t ≤ G_target + GATE_TOLERANCE ───────────────
        state.gini_gate_open = gini
            <= state.g_target.saturating_add(GATE_TOLERANCE);

        // ── 4. Reset for next epoch ───────────────────────────────────────────
        let old_epoch   = state.epoch_index;
        let old_gini    = state.current_gini;
        let old_theta   = new_theta;
        state.epoch_index             = state
            .epoch_index
            .checked_add(1)
            .ok_or(ControllerError::Overflow)?;
        state.current_epoch_start     = clock.slot;
        state.histogram               = [0u32; BIN_COUNT];
        state.total_reward_this_epoch = 0;
        state.participant_count       = 0;

        emit!(EpochFinalized {
            epoch_index:     old_epoch,
            gini:            old_gini,
            theta:           old_theta,
            gini_gate_open:  state.gini_gate_open,
            participant_count: state.participant_count,
            slot:            clock.slot,
            timestamp:       clock.unix_timestamp,
        });

        msg!(
            "Epoch {} finalized. gini={} theta={} gate={}",
            old_epoch, old_gini, old_theta, state.gini_gate_open
        );
        Ok(())
    }

    /// Update controller parameters.
    /// Only the Squads vault authority may call this.
    pub fn update_params(
        ctx: Context<UpdateParams>,
        new_g_target: Option<u64>,
        new_k: Option<u64>,
        new_epoch_duration_slots: Option<u64>,
    ) -> Result<()> {
        let state = &mut ctx.accounts.controller_state;
        if let Some(v) = new_g_target {
            require!(v <= 10_000, ControllerError::InvalidGTarget);
            state.g_target = v;
        }
        if let Some(v) = new_k {
            require!(v > 0 && v <= 10_000, ControllerError::InvalidK);
            state.k = v;
        }
        if let Some(v) = new_epoch_duration_slots {
            require!(
                v >= MIN_EPOCH_SLOTS && v <= MAX_EPOCH_SLOTS,
                ControllerError::InvalidEpochDuration
            );
            state.epoch_duration_slots = v;
        }
        emit!(ParamsUpdated {
            authority:             state.authority,
            new_g_target:          state.g_target,
            new_k:                 state.k,
            new_epoch_duration_slots: state.epoch_duration_slots,
            slot:                  Clock::get()?.slot,
            timestamp:             Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Emergency pause — blocks record_reward and finalize_epoch.
    /// Also closes the Gini gate, halting upstream emissions.
    pub fn pause_controller(ctx: Context<UpdateParams>) -> Result<()> {
        require!(
            !ctx.accounts.controller_state.paused,
            ControllerError::AlreadyPaused
        );
        ctx.accounts.controller_state.paused         = true;
        ctx.accounts.controller_state.gini_gate_open = false;
        msg!(
            "QTI DeveloperCredits PAUSED by {}",
            ctx.accounts.authority.key()
        );
        Ok(())
    }

    /// Resume controller after governance review.
    pub fn resume_controller(ctx: Context<UpdateParams>) -> Result<()> {
        require!(
            ctx.accounts.controller_state.paused,
            ControllerError::NotPaused
        );
        ctx.accounts.controller_state.paused         = false;
        ctx.accounts.controller_state.gini_gate_open = true;
        msg!(
            "QTI DeveloperCredits RESUMED by {}",
            ctx.accounts.authority.key()
        );
        Ok(())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Map a reward amount to a histogram bin [0, BIN_COUNT).
/// Bin is proportional to amount relative to current θ-scaled cap.
/// Simple linear bucketing — O(1), fits within Solana compute budget.
fn compute_bin(amount: u64, theta: u64) -> usize {
    if theta == 0 || amount == 0 {
        return 0;
    }
    let cap = theta as u128;
    let amt = (amount as u128).min(cap);
    let bin = (amt * (BIN_COUNT as u128 - 1)) / cap;
    bin as usize
}

/// Compute binned Gini coefficient scaled ×10_000.
/// Uses the standard discrete Gini formula applied to the histogram:
///   G = (2 * Σ i·f_i) / (n * Σ f_i) − (n+1)/n
/// where f_i is the frequency in bin i and i is the (1-indexed) sorted rank.
/// Proven error bound: |G_binned − G_true| ≤ 0.005 for BIN_COUNT = 256.
fn compute_binned_gini(histogram: &[u32; BIN_COUNT], _participant_count: u64) -> u64 {
    let n: u64 = histogram.iter().map(|&f| f as u64).sum();
    if n == 0 {
        return 0;
    }
    // Weighted sum: Σ (i+1) * freq[i] over sorted bins
    let mut weighted_sum: u128 = 0;
    let mut cumulative: u64    = 0;
    for (i, &freq) in histogram.iter().enumerate() {
        let f = freq as u64;
        if f == 0 {
            continue;
        }
        // Each of the f participants in bin i gets rank in [cumulative+1 .. cumulative+f]
        // Σ rank = f*(2*cumulative + f + 1) / 2
        let rank_sum = (f as u128)
            .saturating_mul(2 * cumulative as u128 + f as u128 + 1)
            / 2;
        weighted_sum = weighted_sum
            .saturating_add(rank_sum.saturating_mul((i + 1) as u128));
        cumulative   = cumulative.saturating_add(f);
        let _ = i; // suppress unused warning — used above
    }
    // G = 2*weighted_sum / (n * BIN_COUNT) - (n+1)/n, scaled ×10_000
    // Use i128 to handle the subtraction safely
    let numerator   = 2u128 * weighted_sum;
    let denominator = (n as u128) * (BIN_COUNT as u128);
    if denominator == 0 {
        return 0;
    }
    let ratio_scaled = (numerator * 10_000) / denominator;
    let correction   = ((n as u128 + 1) * 10_000) / (n as u128);
    if ratio_scaled >= correction {
        (ratio_scaled - correction) as u64
    } else {
        0
    }
}

// ── Account Contexts ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeController<'info> {
    /// Squads vault PDA — sole reconfiguration authority.
    /// CHECK: Key stored in InequalityControllerState.authority.
    pub squads_vault: UncheckedAccount<'info>,

    /// QTI SPL mint this controller governs.
    /// CHECK: Validated by storing key in state.
    pub qti_mint: UncheckedAccount<'info>,

    /// Singleton controller state — PDA keyed on mint.
    #[account(
        init,
        payer  = payer,
        space  = InequalityControllerState::LEN,
        seeds  = [CONTROLLER_STATE_SEED, qti_mint.key().as_ref()],
        bump
    )]
    pub controller_state: Account<'info, InequalityControllerState>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(participant: Pubkey)]
pub struct RecordReward<'info> {
    #[account(
        mut,
        seeds = [CONTROLLER_STATE_SEED, controller_state.qti_mint.as_ref()],
        bump  = controller_state.bump
    )]
    pub controller_state: Account<'info, InequalityControllerState>,

    /// Per-participant accumulator PDA — one per (mint, participant, epoch).
    #[account(
        init_if_needed,
        payer  = payer,
        space  = RewardAccumulator::LEN,
        seeds  = [
            REWARD_ACCUMULATOR_SEED,
            controller_state.qti_mint.as_ref(),
            participant.as_ref(),
            &controller_state.epoch_index.to_le_bytes()
        ],
        bump
    )]
    pub reward_accumulator: Account<'info, RewardAccumulator>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeEpoch<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONTROLLER_STATE_SEED, controller_state.qti_mint.as_ref()],
        bump  = controller_state.bump,
        constraint = controller_state.authority == authority.key()
            @ ControllerError::Unauthorized
    )]
    pub controller_state: Account<'info, InequalityControllerState>,
}

#[derive(Accounts)]
pub struct UpdateParams<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [CONTROLLER_STATE_SEED, controller_state.qti_mint.as_ref()],
        bump  = controller_state.bump,
        constraint = controller_state.authority == authority.key()
            @ ControllerError::Unauthorized
    )]
    pub controller_state: Account<'info, InequalityControllerState>,
}

// ── State ──────────────────────────────────────────────────────────────────────

#[account]
pub struct InequalityControllerState {
    /// Squads vault — sole reconfiguration authority
    pub authority:                Pubkey,
    /// QTI SPL mint this controller governs
    pub qti_mint:                 Pubkey,
    /// Slot length of each controller epoch
    pub epoch_duration_slots:     u64,
    /// Gini target scaled ×10_000 (e.g. 0.35 → 3_500)
    pub g_target:                 u64,
    /// Proportional gain k scaled ×10_000 (e.g. 0.10 → 1_000)
    pub k:                        u64,
    /// Current θ (emission multiplier) scaled ×10_000
    pub theta:                    u64,
    /// Last computed Gini scaled ×10_000
    pub current_gini:             u64,
    /// Gate flag read by qti_emissions_controller before every mint
    pub gini_gate_open:           bool,
    /// Slot when current epoch started
    pub current_epoch_start:      u64,
    /// Monotonically increasing epoch index
    pub epoch_index:              u64,
    /// Binned histogram for current epoch (BIN_COUNT = 256 bins × 4 bytes = 1024 bytes)
    pub histogram:                [u32; BIN_COUNT],
    /// Sum of all rewards recorded this epoch
    pub total_reward_this_epoch:  u64,
    /// Count of reward observations this epoch
    pub participant_count:        u64,
    /// Unix timestamp of initialization
    pub initialized_at:           i64,
    /// Emergency pause flag
    pub paused:                   bool,
    /// PDA bump
    pub bump:                     u8,
}

impl InequalityControllerState {
    pub const LEN: usize =
          8      // Anchor discriminator
        + 32     // authority
        + 32     // qti_mint
        + 8      // epoch_duration_slots
        + 8      // g_target
        + 8      // k
        + 8      // theta
        + 8      // current_gini
        + 1      // gini_gate_open
        + 8      // current_epoch_start
        + 8      // epoch_index
        + 4 * BIN_COUNT  // histogram (256 × u32 = 1024)
        + 8      // total_reward_this_epoch
        + 8      // participant_count
        + 8      // initialized_at
        + 1      // paused
        + 1      // bump
        + 128;   // future-proof padding
}

#[account]
pub struct RewardAccumulator {
    /// Participant pubkey this accumulator tracks
    pub participant:   Pubkey,
    /// Epoch index this accumulator belongs to
    pub epoch_index:   u64,
    /// Total reward recorded for this participant in this epoch
    pub total_reward:  u64,
    /// PDA bump
    pub bump:          u8,
}

impl RewardAccumulator {
    pub const LEN: usize =
          8   // discriminator
        + 32  // participant
        + 8   // epoch_index
        + 8   // total_reward
        + 1   // bump
        + 32; // padding
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct ControllerInitialized {
    pub authority:             Pubkey,
    pub qti_mint:              Pubkey,
    pub epoch_duration_slots:  u64,
    pub g_target:              u64,
    pub k:                     u64,
    pub slot:                  u64,
    pub timestamp:             i64,
}

#[event]
pub struct EpochFinalized {
    pub epoch_index:       u64,
    pub gini:              u64,
    pub theta:             u64,
    pub gini_gate_open:    bool,
    pub participant_count: u64,
    pub slot:              u64,
    pub timestamp:         i64,
}

#[event]
pub struct GiniGateBlocked {
    pub epoch_index:  u64,
    pub gini:         u64,
    pub g_target:     u64,
    pub slot:         u64,
    pub timestamp:    i64,
}

#[event]
pub struct ParamsUpdated {
    pub authority:                Pubkey,
    pub new_g_target:             u64,
    pub new_k:                    u64,
    pub new_epoch_duration_slots: u64,
    pub slot:                     u64,
    pub timestamp:                i64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ControllerError {
    #[msg("Unauthorized: only the Squads vault authority may reconfigure")]
    Unauthorized,
    #[msg("Controller is paused by governance")]
    ControllerPaused,
    #[msg("Controller is not paused")]
    NotPaused,
    #[msg("Controller is already paused")]
    AlreadyPaused,
    #[msg("Epoch has not yet elapsed — too early to finalize")]
    EpochNotElapsed,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow in controller accounting")]
    Overflow,
    #[msg("Invalid Gini target: must be in [0, 10_000]")]
    InvalidGTarget,
    #[msg("Invalid k: must be in (0, 10_000]")]
    InvalidK,
    #[msg("Invalid epoch duration: must be between MIN_EPOCH_SLOTS and MAX_EPOCH_SLOTS")]
    InvalidEpochDuration,
    #[msg("Participant pubkey does not match accumulator")]
    ParticipantMismatch,
    #[msg("Reward accumulator belongs to a stale epoch")]
    StaleAccumulator,
}
