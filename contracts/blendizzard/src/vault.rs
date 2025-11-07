use soroban_fixed_point_math::FixedPoint;
use soroban_sdk::{Address, Env};

use crate::errors::Error;
use crate::events::{emit_deposit, emit_withdraw};
use crate::fee_vault_v2::Client as FeeVaultClient;
use crate::storage;
use crate::types::{EpochUser, User, SCALAR_7, WITHDRAWAL_RESET_THRESHOLD};

// ============================================================================
// Vault Operations
// ============================================================================

/// Deposit assets into the fee-vault
///
/// This function forwards the deposit to fee-vault-v2 and updates user state.
/// If user doesn't exist, creates new user record.
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User making the deposit
/// * `amount` - Amount to deposit (must be positive)
///
/// # Errors
/// * `InvalidAmount` - If amount is <= 0
/// * `FeeVaultError` - If fee-vault deposit fails
///
/// # Authorization Pattern
/// Follows the Soroban cross-contract authorization chain:
/// 1. User authorizes THIS contract via require_auth()
/// 2. Fee-vault's deposit() internally calls pool::supply() for token transfer
/// 3. Authorization flows: User → Blendizzard → FeeVault → Pool
///
/// We do NOT manually transfer tokens - that happens inside fee-vault.
/// The single require_auth() call here covers the entire chain.
pub(crate) fn deposit(env: &Env, user: &Address, amount: i128) -> Result<(), Error> {
    // Validate amount
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    // Authenticate user - covers authorization for entire cross-contract call chain
    user.require_auth();

    // Get or create user record
    let mut user_data = storage::get_user(env, user).unwrap_or(User {
        selected_faction: 0, // Default to WholeNoodle
        total_deposited: 0,
        deposit_timestamp: env.ledger().timestamp(),
    });

    // Call fee-vault-v2 deposit function
    let config = storage::get_config(env);
    let vault_client = FeeVaultClient::new(env, &config.fee_vault);
    let _shares = vault_client.deposit(user, &amount);

    // Note: shares are tracked by the vault, we track underlying amounts here

    // SECURITY FIX: Reset withdrawal tracking if re-depositing during same epoch
    // This prevents the withdrawal reset timing exploit where users could:
    // 1. Withdraw 49.9% (under threshold)
    // 2. Re-deposit immediately
    // 3. Withdraw another 49.9%
    // 4. Repeat to extract capital without FP reset
    let current_epoch = storage::get_current_epoch(env);
    if let Some(mut epoch_user) = storage::get_epoch_user(env, current_epoch, user) {
        // User has activity this epoch - reset their withdrawal counter
        // This ensures they can't game the 50% threshold by cycling deposits/withdrawals
        epoch_user.withdrawn_this_epoch = 0;

        // Update their initial_epoch_balance to reflect the new deposit
        // This ensures the 50% threshold is calculated against current balance
        epoch_user.initial_epoch_balance = user_data.total_deposited + amount;

        storage::set_epoch_user(env, current_epoch, user, &epoch_user);
    }

    // Update user state
    user_data.total_deposited = user_data
        .total_deposited
        .checked_add(amount)
        .ok_or(Error::OverflowError)?;

    // If this is their first deposit, set timestamp
    if user_data.deposit_timestamp == 0 {
        user_data.deposit_timestamp = env.ledger().timestamp();
    }

    // Save user data
    storage::set_user(env, user, &user_data);

    // Emit event
    emit_deposit(env, user, amount, user_data.total_deposited);

    Ok(())
}

/// Withdraw assets from the fee-vault
///
/// Checks if withdrawal exceeds 50% of initial epoch balance. If so, resets
/// the deposit timestamp and updates epoch user data.
///
/// # Arguments
/// * `env` - Contract environment
/// * `user` - User making the withdrawal
/// * `amount` - Amount to withdraw (must be positive)
///
/// # Errors
/// * `InvalidAmount` - If amount is <= 0
/// * `InsufficientBalance` - If user doesn't have enough deposited
/// * `FeeVaultError` - If fee-vault withdrawal fails
///
/// # Authorization Pattern
/// Same as deposit() - requires user authorization which covers the entire
/// cross-contract call chain (Blendizzard → FeeVault → Pool).
pub(crate) fn withdraw(env: &Env, user: &Address, amount: i128) -> Result<(), Error> {
    // Validate amount
    if amount <= 0 {
        return Err(Error::InvalidAmount);
    }

    // Authenticate user - covers authorization for entire cross-contract call chain
    user.require_auth();

    // Get user data
    let mut user_data = storage::get_user(env, user).ok_or(Error::InsufficientBalance)?;

    // Check balance
    if user_data.total_deposited < amount {
        return Err(Error::InsufficientBalance);
    }

    // Call fee-vault-v2 withdraw function
    let config = storage::get_config(env);
    let vault_client = FeeVaultClient::new(env, &config.fee_vault);
    let _underlying_withdrawn = vault_client.withdraw(user, &amount);

    // Note: vault handles the actual token transfer, we track the balance

    // Update user balance
    user_data.total_deposited = user_data
        .total_deposited
        .checked_sub(amount)
        .ok_or(Error::OverflowError)?;

    // Check if we need to reset deposit timestamp (>50% withdrawal)
    let current_epoch = storage::get_current_epoch(env);
    let reset =
        check_and_handle_withdrawal_reset(env, user, &mut user_data, amount, current_epoch)?;

    // Save user data
    storage::set_user(env, user, &user_data);

    // Emit event
    emit_withdraw(env, user, amount, user_data.total_deposited, reset);

    Ok(())
}

/// Check if withdrawal exceeds 50% threshold and handle reset if needed
///
/// This implements the deposit reset rule from PLAN.md:
/// "Withdraw > 50% of total deposit during an epoch -> resets time deposited to 0"
///
/// # Returns
/// * `true` if reset was triggered
/// * `false` if no reset needed
fn check_and_handle_withdrawal_reset(
    env: &Env,
    user: &Address,
    user_data: &mut User,
    withdrawal_amount: i128,
    current_epoch: u32,
) -> Result<bool, Error> {
    // Get or create epoch user data
    let mut epoch_user = storage::get_epoch_user(env, current_epoch, user).unwrap_or(EpochUser {
        epoch_faction: None,
        available_fp: 0,
        locked_fp: 0,
        total_fp_contributed: 0,
        withdrawn_this_epoch: 0,
        initial_epoch_balance: user_data.total_deposited + withdrawal_amount, // Before withdrawal
    });

    // Update withdrawn amount
    epoch_user.withdrawn_this_epoch = epoch_user
        .withdrawn_this_epoch
        .checked_add(withdrawal_amount)
        .ok_or(Error::OverflowError)?;

    // Check if we've crossed the 50% threshold
    // Formula: withdrawn_this_epoch > initial_epoch_balance * 0.5
    let threshold = epoch_user
        .initial_epoch_balance
        .fixed_mul_floor(WITHDRAWAL_RESET_THRESHOLD, SCALAR_7)
        .ok_or(Error::OverflowError)?;

    let reset = epoch_user.withdrawn_this_epoch > threshold;

    if reset {
        // Reset deposit timestamp to now
        user_data.deposit_timestamp = env.ledger().timestamp();

        // Reset faction points for this epoch
        // Recalculate FP with new time multiplier (1.0x since timestamp just reset)
        let new_fp = crate::faction_points::calculate_faction_points(env, user)?;

        // Update epoch user's available FP
        // Note: locked FP stays locked (those are in active games)
        epoch_user.available_fp = new_fp.saturating_sub(epoch_user.locked_fp);
    }

    // Save epoch user data
    storage::set_epoch_user(env, current_epoch, user, &epoch_user);

    Ok(reset)
}

// ============================================================================
// Query Functions
// ============================================================================

/// Get user's total deposited balance
#[allow(dead_code)]
pub(crate) fn get_balance(env: &Env, user: &Address) -> i128 {
    storage::get_user(env, user)
        .map(|u| u.total_deposited)
        .unwrap_or(0)
}

/// Get user's deposit timestamp
#[allow(dead_code)]
pub(crate) fn get_deposit_timestamp(env: &Env, user: &Address) -> u64 {
    storage::get_user(env, user)
        .map(|u| u.deposit_timestamp)
        .unwrap_or(0)
}
