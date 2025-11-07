use super::testutils::{
    create_blendizzard_with_mock_vault, create_test_blendizzard, setup_test_env,
};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Address, BytesN};

// ============================================================================
// Initialization Tests
// ============================================================================

#[test]
fn test_initialization() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Create contract (this calls __constructor)
    let client = create_test_blendizzard(&env, &admin);

    // Verify admin is set
    let retrieved_admin = client.get_admin();
    assert_eq!(retrieved_admin, admin, "Admin address mismatch");
}

#[test]
fn test_initialization_sets_epoch() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Verify initial epoch was created
    let epoch_info = client.get_epoch(&None);
    assert_eq!(epoch_info.epoch_number, 0);
    assert!(!epoch_info.is_finalized);

    // Verify admin can perform admin actions
    let new_game = Address::generate(&env);
    client.add_game(&new_game);
    assert!(client.is_game(&new_game));
}

// ============================================================================
// Deposit & Withdraw Tests
// ============================================================================

#[test]
fn test_deposit() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit 100 USDC (7 decimals)
    let amount: i128 = 100_0000000;
    client.deposit(&user, &amount);

    // Verify balance
    let player_info = client.get_player(&user);
    assert_eq!(player_info.total_deposited, amount);
}

#[test]
#[should_panic]
fn test_deposit_zero() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Try to deposit 0 - should panic
    client.deposit(&user, &0);
}

#[test]
fn test_withdraw() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Deposit 1000 USDC
    let deposit_amount: i128 = 1000_0000000;
    client.deposit(&user, &deposit_amount);

    // Withdraw 200 USDC
    let withdraw_amount: i128 = 200_0000000;
    client.withdraw(&user, &withdraw_amount);

    // Verify balance
    let player_info = client.get_player(&user);
    assert_eq!(
        player_info.total_deposited,
        deposit_amount - withdraw_amount
    );
}

#[test]
#[should_panic]
fn test_withdraw_insufficient_balance() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Deposit 100 USDC
    client.deposit(&user, &100_0000000);

    // Try to withdraw more than deposited - should panic
    client.withdraw(&user, &200_0000000);
}

// ============================================================================
// Faction Selection Tests
// ============================================================================

#[test]
fn test_select_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Select WholeNoodle faction (0)
    client.select_faction(&user, &0);

    // Verify faction
    let player_info = client.get_player(&user);
    assert_eq!(player_info.selected_faction, 0);
}

#[test]
fn test_change_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Select WholeNoodle (0)
    client.select_faction(&user, &0);

    // Change to PointyStick (1)
    client.select_faction(&user, &1);

    let player_info = client.get_player(&user);
    assert_eq!(player_info.selected_faction, 1);
}

#[test]
#[should_panic]
fn test_invalid_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Try invalid faction ID - should panic
    client.select_faction(&user, &99);
}

// ============================================================================
// Game Registry Tests
// ============================================================================

#[test]
fn test_add_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Initially not whitelisted
    assert!(!client.is_game(&game_contract));

    // Add game
    client.add_game(&game_contract);

    // Now whitelisted
    assert!(client.is_game(&game_contract));
}

#[test]
fn test_remove_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Add game
    client.add_game(&game_contract);
    assert!(client.is_game(&game_contract));

    // Remove game
    client.remove_game(&game_contract);
    assert!(!client.is_game(&game_contract));
}

// ============================================================================
// Game Lifecycle Tests
// ============================================================================

#[test]
fn test_start_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Setup
    client.add_game(&game_contract);
    client.deposit(&player1, &1000_0000000);
    client.deposit(&player2, &1000_0000000);
    client.select_faction(&player1, &0);
    client.select_faction(&player2, &1);

    // Start game
    let session_id = BytesN::from_array(&env, &[1u8; 32]);
    let wager: i128 = 10_0000000;

    client.start_game(
        &game_contract,
        &session_id,
        &player1,
        &player2,
        &wager,
        &wager,
    );

    // Verify FP was locked
    let p1_epoch = client.get_epoch_player(&player1);
    let p2_epoch = client.get_epoch_player(&player2);

    assert!((p1_epoch.available_fp + p1_epoch.locked_fp) > 0, "Player 1 should have FP");
    assert!((p2_epoch.available_fp + p2_epoch.locked_fp) > 0, "Player 2 should have FP");
}

#[test]
#[should_panic]
fn test_start_game_not_whitelisted() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env); // Not whitelisted
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Setup players but don't whitelist game
    client.deposit(&player1, &1000_0000000);
    client.deposit(&player2, &1000_0000000);
    client.select_faction(&player1, &0);
    client.select_faction(&player2, &1);

    // Try to start game - should panic
    let session_id = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(
        &game_contract,
        &session_id,
        &player1,
        &player2,
        &10_0000000,
        &10_0000000,
    );
}

// ============================================================================
// Epoch Tests
// ============================================================================

#[test]
fn test_get_initial_epoch() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Get current epoch
    let epoch_info = client.get_epoch(&None);

    assert_eq!(epoch_info.epoch_number, 0);
    assert!(!epoch_info.is_finalized);
}

#[test]
fn test_faction_locked_after_game() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game_contract = Address::generate(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Setup
    client.add_game(&game_contract);
    client.deposit(&player1, &1000_0000000);
    client.deposit(&player2, &1000_0000000);
    client.select_faction(&player1, &0);
    client.select_faction(&player2, &1);

    // Faction not locked initially
    assert!(!client.is_faction_locked(&player1));

    // Start game
    let session_id = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(
        &game_contract,
        &session_id,
        &player1,
        &player2,
        &10_0000000,
        &10_0000000,
    );

    // Faction should now be locked
    assert!(client.is_faction_locked(&player1));
}

// ============================================================================
// Admin Tests
// ============================================================================

#[test]
fn test_change_admin() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let client = create_test_blendizzard(&env, &admin);

    // Verify initial admin
    assert_eq!(client.get_admin(), admin);

    // Change admin
    client.set_admin(&new_admin);

    // Verify new admin
    assert_eq!(client.get_admin(), new_admin);
}
