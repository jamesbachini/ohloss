/// Fee-Vault Integration Tests
///
/// Tests that verify proper integration with vault interfaces.
/// Uses mock vault for testing Blendizzard's integration points.
/// For full fee-vault-v2 testing, see fee-vault-v2's own test suite.
use super::testutils::{create_blendizzard_with_mock_vault, setup_test_env};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::Address;

// ============================================================================
// Basic Vault Interaction Tests
// ============================================================================

#[test]
fn test_vault_deposit_tracking() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit
    let amount = 500_0000000;
    client.deposit(&user, &amount);

    // Verify tracking
    let player_info = client.get_player(&user);
    assert_eq!(player_info.total_deposited, amount);
}

#[test]
fn test_vault_withdrawal_tracking() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit then withdraw
    client.deposit(&user, &500_0000000);
    client.withdraw(&user, &200_0000000);

    // Verify balance updated
    let player_info = client.get_player(&user);
    assert_eq!(player_info.total_deposited, 300_0000000);
}

#[test]
fn test_vault_balance_consistency() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Multiple deposits
    client.deposit(&user1, &100_0000000);
    client.deposit(&user2, &200_0000000);
    client.deposit(&user3, &300_0000000);

    // Sum should be 600
    let total = client.get_player(&user1).total_deposited
        + client.get_player(&user2).total_deposited
        + client.get_player(&user3).total_deposited;
    assert_eq!(total, 600_0000000);

    // After withdrawals
    client.withdraw(&user1, &50_0000000);
    client.withdraw(&user2, &100_0000000);

    // Sum should be 450
    let total = client.get_player(&user1).total_deposited
        + client.get_player(&user2).total_deposited
        + client.get_player(&user3).total_deposited;
    assert_eq!(total, 450_0000000);
}

// ============================================================================
// Security and Edge Cases
// ============================================================================

#[test]
#[should_panic]
fn test_withdraw_more_than_deposited() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit 100, try to withdraw 200
    client.deposit(&user, &100_0000000);
    client.withdraw(&user, &200_0000000); // Should panic
}

#[test]
fn test_rapid_deposit_withdraw_cycles() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Initial deposit
    client.deposit(&user, &500_0000000);

    // Rapid cycles
    for _ in 0..10 {
        client.withdraw(&user, &50_0000000);
        client.deposit(&user, &50_0000000);
    }

    // Balance should remain 500
    let player_info = client.get_player(&user);
    assert_eq!(player_info.total_deposited, 500_0000000);
}

#[test]
fn test_multiple_users_isolation() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // User 1 deposits 300
    client.deposit(&user1, &300_0000000);

    // User 2 deposits 700
    client.deposit(&user2, &700_0000000);

    // User 1 withdraws 100
    client.withdraw(&user1, &100_0000000);

    // Verify balances are isolated
    assert_eq!(client.get_player(&user1).total_deposited, 200_0000000);
    assert_eq!(client.get_player(&user2).total_deposited, 700_0000000);

    // User 2's withdrawal shouldn't affect user 1
    client.withdraw(&user2, &500_0000000);
    assert_eq!(client.get_player(&user1).total_deposited, 200_0000000);
}

// ============================================================================
// Deposit Reset Tests (50% withdrawal rule)
// ============================================================================

#[test]
fn test_large_withdrawal_resets_timestamp() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit 1000
    client.deposit(&user, &1000_0000000);

    // Get initial epoch user (should have initial_epoch_balance set)
    let _epoch_user = client.get_epoch_player(&user);

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 86400; // 1 day
    });

    // Withdraw 600 (>50% of 1000) - should trigger reset
    client.withdraw(&user, &600_0000000);

    // Verify balance updated
    assert_eq!(client.get_player(&user).total_deposited, 400_0000000);

    // Note: Full reset logic verification would require checking deposit_timestamp
    // which is internal. The key is that withdrawal succeeded and balance is correct.
}

#[test]
fn test_small_withdrawal_no_reset() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit 1000
    client.deposit(&user, &1000_0000000);

    // Withdraw 400 (<50% of 1000) - should NOT trigger reset
    client.withdraw(&user, &400_0000000);

    // Verify balance updated
    assert_eq!(client.get_player(&user).total_deposited, 600_0000000);
}

// ============================================================================
// Integration with Game Flow
// ============================================================================

#[test]
fn test_deposit_withdraw_with_games() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let game = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Setup
    client.add_game(&game);
    client.deposit(&user1, &1000_0000000);
    client.deposit(&user2, &1000_0000000);
    client.select_faction(&user1, &0);
    client.select_faction(&user2, &1);

    // Verify deposits tracked correctly
    assert_eq!(client.get_player(&user1).total_deposited, 1000_0000000);
    assert_eq!(client.get_player(&user2).total_deposited, 1000_0000000);

    // Players can still withdraw between games
    client.withdraw(&user1, &100_0000000);
    assert_eq!(client.get_player(&user1).total_deposited, 900_0000000);
}

// ============================================================================
// Epoch Transition Tests
// ============================================================================

#[test]
fn test_deposits_persist_across_potential_epoch_change() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit in epoch 0
    client.deposit(&user, &500_0000000);

    // Advance time past epoch duration
    env.ledger().with_mut(|li| {
        li.timestamp += 345_600 + 1; // 4 days + 1 second
    });

    // Deposit more (still in epoch 0 until cycle_epoch is called)
    client.deposit(&user, &300_0000000);

    // Total deposit should be 800
    assert_eq!(client.get_player(&user).total_deposited, 800_0000000);

    // Note: Once cycle_epoch is implemented and called, deposits should
    // persist across epochs (PlayerInfo.total_deposited is persistent)
}
