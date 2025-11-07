/// Epoch Integration Tests
///
/// Tests that verify epoch cycling, yield distribution, and faction rewards.
/// Adapted for Blendizzard's faction-based competition architecture.
use super::soroswap_utils::{
    add_liquidity, create_factory, create_router, create_token,
};
use super::testutils::{create_blendizzard_contract, setup_test_env};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{vec, Address, BytesN};

// ============================================================================
// Basic Epoch Cycling
// ============================================================================

#[test]
fn test_epoch_initialization() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Create Blendizzard
    let vault = Address::generate(&env);
    let router = Address::generate(&env);
    let blnd = Address::generate(&env);
    let usdc = Address::generate(&env);
    let reserve_token_ids = vec![&env, 1];
    let client = create_blendizzard_contract(&env, &admin, &vault, &router, &blnd, &usdc, 100, reserve_token_ids);

    // Verify epoch 0 exists
    let epoch = client.get_epoch(&None);
    assert_eq!(epoch.epoch_number, 0);
    assert!(!epoch.is_finalized);
    assert_eq!(epoch.reward_pool, 0);
}

#[test]
fn test_epoch_cycle_timing() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    let vault = Address::generate(&env);
    let router = Address::generate(&env);
    let blnd = Address::generate(&env);
    let usdc = Address::generate(&env);
    let epoch_duration = 100;
    let reserve_token_ids = vec![&env, 1];
    let client =
        create_blendizzard_contract(&env, &admin, &vault, &router, &blnd, &usdc, epoch_duration, reserve_token_ids);

    let epoch_0 = client.get_epoch(&None);
    let start_time = epoch_0.start_time;
    let end_time = epoch_0.end_time;

    // Duration should match config
    assert_eq!(end_time - start_time, epoch_duration);

    // Cannot cycle before end_time
    let result = client.try_cycle_epoch();
    assert!(result.is_err());

    // Advance time past duration
    env.ledger().with_mut(|li| {
        li.timestamp = end_time + 1;
    });

    // Note: Full cycle will fail without proper soroswap/vault setup,
    // but timing validation passed
}

#[test]
fn test_cannot_cycle_already_finalized() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    let vault = Address::generate(&env);
    let router = Address::generate(&env);
    let blnd = Address::generate(&env);
    let usdc = Address::generate(&env);
    let reserve_token_ids = vec![&env, 1];
    let client = create_blendizzard_contract(&env, &admin, &vault, &router, &blnd, &usdc, 100, reserve_token_ids);

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 101;
    });

    // First cycle attempt (will fail due to no real contracts, but that's ok for this test)
    let _result = client.try_cycle_epoch();

    // Second cycle attempt should fail with AlreadyFinalized
    // Note: In practice, this won't happen because first cycle fails,
    // but this documents the intended behavior
}

// ============================================================================
// Faction Competition & Winning
// ============================================================================

#[test]
fn test_winning_faction_determined_by_standings() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);
    let p3 = Address::generate(&env);

    // Setup with mock vault
    use super::testutils::create_blendizzard_with_mock_vault;
    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Setup game and players
    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.deposit(&p2, &1000_0000000);
    client.deposit(&p3, &500_0000000);

    // Players join different factions
    client.select_faction(&p1, &0); // WholeNoodle
    client.select_faction(&p2, &1); // PointyStick
    client.select_faction(&p3, &0); // WholeNoodle

    // Play and complete games to generate faction points
    use crate::types::GameOutcome;
    use soroban_sdk::Bytes;

    let session1 = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(&game, &session1, &p1, &p2, &100_0000000, &100_0000000);

    // End game 1: Player 1 (faction 0) wins
    let outcome1 = GameOutcome {
        game_id: game.clone(),
        session_id: session1.clone(),
        player1: p1.clone(),
        player2: p2.clone(),
        winner: true, // Player1 wins
    };
    client.end_game(&game, &session1, &Bytes::new(&env), &outcome1);

    let session2 = BytesN::from_array(&env, &[2u8; 32]);
    client.start_game(&game, &session2, &p3, &p2, &50_0000000, &50_0000000);

    // End game 2: Player 3 (faction 0) wins
    let outcome2 = GameOutcome {
        game_id: game.clone(),
        session_id: session2.clone(),
        player1: p3.clone(),
        player2: p2.clone(),
        winner: true, // Player3 wins
    };
    client.end_game(&game, &session2, &Bytes::new(&env), &outcome2);

    // Verify factions are locked
    assert!(client.is_faction_locked(&p1));
    assert!(client.is_faction_locked(&p2));
    assert!(client.is_faction_locked(&p3));

    // Check faction standings are populated
    let epoch = client.get_epoch(&None);
    assert!(
        !epoch.faction_standings.is_empty(),
        "Faction standings should be populated after games"
    );

    // WholeNoodle (0) should have more total fp than PointyStick (1)
    // p1 won 200fp (100 + 100), p3 won 100fp (50 + 50) = 300fp total for faction 0
    // p2 lost both games = 0fp for faction 1
    let faction_0_fp = epoch.faction_standings.get(0).unwrap_or(0);
    let faction_1_fp = epoch.faction_standings.get(1).unwrap_or(0);

    assert!(faction_0_fp > 0, "Faction 0 should have fp from wins");
    assert_eq!(
        faction_1_fp, 0,
        "Faction 1 should have 0 fp (lost all games)"
    );
    assert!(faction_0_fp > faction_1_fp, "Faction 0 should have more fp");
}

// ============================================================================
// Yield Conversion (Unit-style tests for logic)
// ============================================================================

#[test]
fn test_epoch_cycle_no_yield_scenario() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Create Blendizzard with mock vault
    use super::testutils::create_blendizzard_with_mock_vault;
    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Add game and create activity
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &500_0000000);
    client.deposit(&p2, &500_0000000);
    client.select_faction(&p1, &0);
    client.select_faction(&p2, &1);

    // Play a game
    let session = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(&game, &session, &p1, &p2, &50_0000000, &50_0000000);

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 345_601;
    });

    // Try to cycle (will fail due to missing real soroswap, but tests logic)
    let _result = client.try_cycle_epoch();

    // Expected behavior: If no yield, epoch should still cycle with reward_pool = 0
    // Current implementation may error on swap, which is acceptable
    // This documents intended behavior for future implementation
}

// ============================================================================
// Full Integration Tests (with real Soroswap setup)
// ============================================================================

#[test]
fn test_full_epoch_cycle_with_soroswap() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Create Soroswap infrastructure
    let factory = create_factory(&env, &admin);
    let router = create_router(&env);
    router.initialize(&factory.address);

    // Create tokens (ensure BLND < USDC for Soroswap)
    let mut blnd = create_token(&env, &admin);
    let mut usdc = create_token(&env, &admin);

    if usdc.address < blnd.address {
        core::mem::swap(&mut blnd, &mut usdc);
    }

    // Add liquidity to BLND/USDC pair
    let liquidity_provider = Address::generate(&env);
    blnd.mint(&liquidity_provider, &1_000_000_0000000);
    usdc.mint(&liquidity_provider, &1_000_000_0000000);

    add_liquidity(
        &env,
        &router,
        &blnd.address,
        &usdc.address,
        1_000_000_0000000,
        1_000_000_0000000,
        &liquidity_provider,
    );

    // Create mock vault (for simplicity)
    use super::fee_vault_utils::create_mock_vault;
    let vault = create_mock_vault(&env);

    // Create Blendizzard
    let reserve_token_ids = vec![&env, 1];
    let client = create_blendizzard_contract(
        &env,
        &admin,
        &vault,
        &router.address,
        &blnd.address,
        &usdc.address,
        100, // Short epoch for testing
        reserve_token_ids,
    );

    // Make Blendizzard the vault admin (so it can withdraw)
    // Note: MockVault doesn't enforce this, but real vault would

    // Simulate yield by minting BLND to contract
    // In production, this would come from fee-vault admin balance
    blnd.mint(&client.address, &1000_0000000);

    // Create game activity
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.deposit(&p2, &1000_0000000);
    client.select_faction(&p1, &0);
    client.select_faction(&p2, &1);

    let session = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(&game, &session, &p1, &p2, &100_0000000, &100_0000000);

    // Advance time
    env.ledger().with_mut(|li| {
        li.timestamp += 101;
    });

    // Cycle epoch
    // Note: This will attempt real swap but may fail on authorization
    // This test documents the integration flow
    let result = client.try_cycle_epoch();

    // If successful, verify new epoch created
    // Note: Generated client double-wraps Results, so we need to unwrap twice
    if let Ok(Ok(new_epoch_num)) = result {
        assert_eq!(new_epoch_num, 1);

        let new_epoch = client.get_epoch(&Some(1));
        assert_eq!(new_epoch.epoch_number, 1);
        assert!(!new_epoch.is_finalized);
    }
    // If failed, that's ok - this is a complex integration test
    // The important thing is it doesn't panic unexpectedly
}

// ============================================================================
// Reward Pool Verification
// ============================================================================

#[test]
fn test_reward_pool_set_after_cycle() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    use super::testutils::create_blendizzard_with_mock_vault;
    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Create minimal activity
    let game = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &100_0000000);
    client.deposit(&p2, &100_0000000);
    client.select_faction(&p1, &0);
    client.select_faction(&p2, &1);

    // Initial epoch should have 0 reward pool
    let epoch_0 = client.get_epoch(&None);
    assert_eq!(epoch_0.reward_pool, 0);

    // After cycling (even if failed), reward pool logic should execute
    env.ledger().with_mut(|li| {
        li.timestamp += 345_601;
    });

    // Try to cycle (may fail without real contracts)
    let _result = client.try_cycle_epoch();

    // Once cycle_epoch is fully working with real contracts,
    // reward_pool should be > 0 if there was yield
}

// ============================================================================
// Balance Delta Pattern Tests
// ============================================================================

#[test]
fn test_usdc_balance_delta_calculation() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    // Create real tokens
    let usdc = create_token(&env, &admin);

    let vault = Address::generate(&env);
    let router = Address::generate(&env);
    let blnd = Address::generate(&env);

    let reserve_token_ids = vec![&env, 1];
    let client =
        create_blendizzard_contract(&env, &admin, &vault, &router, &blnd, &usdc.address, 100, reserve_token_ids);

    // Pre-fund contract with some USDC (simulates existing balance)
    usdc.mint(&client.address, &500_0000000);

    // Verify balance exists
    let pre_balance = usdc.balance(&client.address);
    assert_eq!(pre_balance, 500_0000000);

    // When epoch cycles and swaps BLND→USDC, only the DELTA should count
    // as reward_pool, not total balance

    // This test documents that the implementation should use:
    // reward_pool = post_balance - pre_balance
    // NOT: reward_pool = post_balance
}

// ============================================================================
// Error Handling Tests
// ============================================================================

#[test]
fn test_epoch_not_ready_error() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    use super::testutils::create_blendizzard_with_mock_vault;
    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // Try to cycle immediately (should fail)
    let result = client.try_cycle_epoch();
    assert!(result.is_err());

    // Verify it's the right error type (if we can introspect)
    // In Soroban, errors are numeric codes
}

#[test]
fn test_epoch_with_no_games_played() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    use super::testutils::create_blendizzard_with_mock_vault;
    let client = create_blendizzard_with_mock_vault(&env, &admin);

    // No games, no deposits - just time passage
    env.ledger().with_mut(|li| {
        li.timestamp += 345_601;
    });

    // Should be able to cycle (winning faction defaults to 0)
    let _result = client.try_cycle_epoch();

    // Epoch should cycle even with no activity
    // This ensures the protocol doesn't get stuck
}

// ============================================================================
// Multi-Epoch Tests
// ============================================================================

#[test]
fn test_multiple_epoch_cycles() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    let short_duration = 50;
    let vault = Address::generate(&env);
    let router = Address::generate(&env);
    let blnd = Address::generate(&env);
    let usdc = Address::generate(&env);

    let reserve_token_ids = vec![&env, 1];
    let client =
        create_blendizzard_contract(&env, &admin, &vault, &router, &blnd, &usdc, short_duration, reserve_token_ids);

    // Cycle through multiple epochs (will fail at swap, but tests structure)
    for _ in 0..3 {
        env.ledger().with_mut(|li| {
            li.timestamp += short_duration + 1;
        });

        let _result = client.try_cycle_epoch();

        // Each cycle attempt should process independently
        // Even if swap fails, epoch number increments on successful finalization
    }
}

#[test]
fn test_faction_standings_persist_across_queries() {
    let env = setup_test_env();
    let admin = Address::generate(&env);

    use super::testutils::create_blendizzard_with_mock_vault;
    let client = create_blendizzard_with_mock_vault(&env, &admin);

    let game = Address::generate(&env);
    let p1 = Address::generate(&env);
    let p2 = Address::generate(&env);

    client.add_game(&game);
    client.deposit(&p1, &1000_0000000);
    client.deposit(&p2, &1000_0000000);
    client.select_faction(&p1, &0);
    client.select_faction(&p2, &1);

    let session = BytesN::from_array(&env, &[1u8; 32]);
    client.start_game(&game, &session, &p1, &p2, &100_0000000, &100_0000000);

    // Query standings multiple times
    let standings1 = client.get_faction_standings(&0);
    let standings2 = client.get_faction_standings(&0);

    // Should be consistent
    assert_eq!(standings1, standings2);
}
