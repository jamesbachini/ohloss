#![allow(dead_code)]

/// Fee Vault V2 Test Utilities
///
/// This module provides helpers for testing fee-vault integration.
/// Based on patterns from blend-together project.
use soroban_sdk::{contract, contractimpl, Address, Env};

// ============================================================================
// WASM Imports
// ============================================================================

mod fee_vault {
    soroban_sdk::contractimport!(file = "./wasms/fee_vault_v2.wasm");
    pub type FeeVaultClient<'a> = Client<'a>;
}
pub use fee_vault::FeeVaultClient;

// ============================================================================
// Helper Functions
// ============================================================================

/// Create and initialize a fee vault contract
///
/// # Arguments
/// * `env` - Test environment
/// * `admin` - Admin address for the vault
/// * `pool` - Blend pool address
/// * `asset` - Asset address (USDC)
/// * `rate_type` - Fee rate type (0 = fixed, 1 = dynamic)
/// * `rate` - Fee rate (basis points with 5 decimals, e.g., 100_00000 = 1%)
/// * `signer` - Optional signer address
///
/// # Returns
/// Initialized FeeVaultClient
pub fn create_fee_vault<'a>(
    env: &Env,
    admin: &Address,
    pool: &Address,
    asset: &Address,
    rate_type: u32,
    rate: u32,
    signer: Option<Address>,
) -> FeeVaultClient<'a> {
    // Register contract with constructor arguments
    let address = env.register(
        fee_vault::WASM,
        (
            admin.clone(),
            pool.clone(),
            asset.clone(),
            rate_type,
            rate,
            signer,
        ),
    );

    FeeVaultClient::new(env, &address)
}

/// Create a simple fee vault for testing with default parameters
///
/// Uses fixed rate of 1% (100_00000 basis points)
pub fn create_test_fee_vault<'a>(
    env: &Env,
    admin: &Address,
    pool: &Address,
    asset: &Address,
) -> FeeVaultClient<'a> {
    create_fee_vault(env, admin, pool, asset, 0, 100_00000, None)
}

// ============================================================================
// Mock Vault (for smoke tests that don't need real vault)
// ============================================================================

#[contract]
pub struct MockVault;

#[contractimpl]
impl MockVault {
    /// Mock deposit - just returns the amount as "shares"
    pub fn deposit(_env: Env, _user: Address, amount: i128) -> i128 {
        amount // Return amount as shares (1:1)
    }

    /// Mock withdraw - just returns the amount as underlying
    pub fn withdraw(_env: Env, _user: Address, amount: i128) -> i128 {
        amount // Return amount as underlying (1:1)
    }

    /// Mock get_shares
    pub fn get_shares(_env: Env, _user: Address) -> i128 {
        0
    }

    /// Mock admin_withdraw - returns the requested amount
    /// This allows epoch cycling tests to simulate BLND withdrawal
    ///
    /// Note: This doesn't actually transfer BLND. Tests using epoch cycling
    /// should mint BLND directly to the Blendizzard contract before each cycle,
    /// or use a stateful vault that holds and transfers real BLND tokens.
    pub fn admin_withdraw(_env: Env, amount: i128) -> i128 {
        amount // Return requested amount
    }

    /// Mock get_underlying_admin_balance - returns 1000 BLND for testing
    /// This allows epoch cycling tests to have BLND available for swap
    /// Note: The actual BLND must be minted to the Blendizzard contract in tests
    pub fn get_underlying_admin_balance(_env: Env) -> i128 {
        1000_0000000 // 1000 BLND per cycle
    }

    /// Mock claim_emissions - returns 0 for testing
    /// This simulates claiming BLND emissions from the Blend pool
    /// For mock testing, we just return 0 since we don't have real emissions
    /// Note: The actual BLND must be minted to the Blendizzard contract in tests
    pub fn claim_emissions(_env: Env, _reserve_token_ids: soroban_sdk::Vec<u32>, _to: Address) -> i128 {
        0 // No emissions in mock
    }
}

/// Create a mock vault for smoke tests (no constructor auth issues)
pub fn create_mock_vault(env: &Env) -> Address {
    env.register(MockVault, ())
}

// ============================================================================
// Mock Pool (for real vault)
// ============================================================================

use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reserve {
    pub b_rate: i128,
    pub b_supply: i128,
    pub c_factor: u32,
    pub d_rate: i128,
    pub index: u32,
    pub ir_mod: i128,
    pub l_factor: u32,
    pub last_time: u64,
    pub scalar: i128,
}

#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    /// Mock get_reserve function for fee-vault-v2
    pub fn get_reserve(_env: Env, _reserve: Address) -> Reserve {
        // Return a mock reserve with reasonable values
        Reserve {
            b_rate: 1_100_000_000_000, // 1.1 exchange rate
            b_supply: 0,
            c_factor: 900_0000,
            d_rate: 1_000_000_000_000,
            index: 0,
            ir_mod: 0,
            l_factor: 900_0000,
            last_time: 0,
            scalar: 10_000_000, // 7 decimals
        }
    }
}

/// Create a mock Blend pool for testing
pub fn create_mock_pool(env: &Env) -> Address {
    env.register(MockPool, ())
}

// ============================================================================
// Fee Vault Operations
// ============================================================================

/// Deposit assets into fee vault
pub fn deposit_to_vault(vault: &FeeVaultClient, user: &Address, amount: i128) -> i128 {
    vault.deposit(user, &amount)
}

/// Get shares for a user
pub fn get_vault_shares(vault: &FeeVaultClient, user: &Address) -> i128 {
    vault.get_shares(user)
}

/// Admin withdraw from vault (for yield distribution)
pub fn admin_withdraw_from_vault(vault: &FeeVaultClient, amount: i128) -> i128 {
    vault.admin_withdraw(&amount)
}

// ============================================================================
// Test Utilities
// ============================================================================

/// Calculate expected shares for a deposit
///
/// Formula: shares = amount * total_shares / total_b_tokens
/// If first deposit: shares = amount
pub fn calculate_expected_shares(amount: i128, total_shares: i128, total_b_tokens: i128) -> i128 {
    if total_shares == 0 || total_b_tokens == 0 {
        amount
    } else {
        (amount * total_shares) / total_b_tokens
    }
}

#[cfg(test)]
mod tests {
    use super::super::testutils::setup_test_env;
    use super::*;

    #[test]
    fn test_mock_pool_creation() {
        let env = setup_test_env();

        // Test that we can create a mock pool
        let pool = create_mock_pool(&env);

        // Verify pool was created
        assert!(pool.to_string().len() > 0);

        // Note: Full fee vault creation test requires more complex setup
        // with proper authorization chain. This will be covered in
        // integration tests when we wire everything together.
    }

    #[test]
    fn test_calculate_expected_shares() {
        // First deposit
        assert_eq!(calculate_expected_shares(1000, 0, 0), 1000);

        // Subsequent deposits
        assert_eq!(calculate_expected_shares(1000, 5000, 5000), 1000);
        assert_eq!(calculate_expected_shares(500, 1000, 2000), 250);
    }
}
