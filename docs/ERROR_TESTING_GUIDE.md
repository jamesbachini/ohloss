# Error Testing Guide for Blendizzard

This guide documents error testing patterns in Stellar/Soroban contracts based on research from production codebases.

## Overview

After reviewing error testing patterns from:
- **fee-vault-v2** (script3)
- **blend-contracts-v2** (blend-capital)
- **soroswap/core** (soroswap)
- **soroban-examples** (stellar)

We've identified three main patterns for error testing in Soroban contracts.

## Pattern Comparison

### Pattern 1: Type-Safe Error Assertions (RECOMMENDED)

**Used by:** soroswap/core, soroban-examples
**Approach:** Call `try_` methods and assert specific error enum variants

```rust
#[test]
fn test_insufficient_faction_points() {
    let result = contract.try_start_game(&player, &wager);
    assert_eq!(result, Err(Ok(Error::InsufficientFactionPoints)));
}
```

**Advantages:**
- ✅ Compile-time type checking
- ✅ Readable (uses error names, not numbers)
- ✅ Refactoring-safe (compiler catches changes)
- ✅ Better error messages on test failure
- ✅ No panic recovery needed

**Example from soroswap/core:**
```rust
#[test]
fn try_swap_not_yet_initialized() {
    let test = SoroswapPairTest::setup();
    test.env.budget().reset_unlimited();
    let result = test.contract.try_swap(&0, &0, &test.user);
    assert_eq!(result, Err(Ok(SoroswapPairError::NotInitialized)));
}
```

### Pattern 2: Numeric Error Code Assertions

**Used by:** fee-vault-v2
**Approach:** Call `try_` methods and compare with `Error::from_contract_error(CODE)`

```rust
#[test]
fn test_invalid_amount() {
    assert_eq!(
        vault_client.try_set_fee(&0, &1_000_0001).err(),
        Some(Ok(Error::from_contract_error(104)))
    );
}
```

**Advantages:**
- ✅ No panic recovery
- ❌ Requires knowing numeric error codes
- ❌ Less readable
- ❌ Fragile to renumbering

**Example from fee-vault-v2:**
```rust
assert_eq!(
    vault_client.try_set_fee(&0, &1_000_0001).err(),
    Some(Ok(Error::from_contract_error(104)))
);
```

### Pattern 3: Panic-Based Testing

**Used by:** blend-contracts-v2
**Approach:** Use `#[should_panic]` attribute with expected error message

```rust
#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_insufficient_faction_points() {
    contract.start_game(&player, &wager); // Will panic
}
```

**Advantages:**
- ✅ Concise
- ❌ Less precise (partial string matching)
- ❌ Can't test multiple errors in one test
- ❌ Requires panic recovery overhead

**Example from blend-contracts-v2:**
```rust
#[test]
#[should_panic(expected = "Error(Contract, #1206)")]
fn test_require_action_allowed_borrow_while_on_ice_panics() {
    // Test code that panics
}
```

## Recommended Approach for Blendizzard

We've adopted **Pattern 1** (Type-Safe Error Assertions) and created a helper function to make it even cleaner.

### Using the Helper Function

```rust
use super::testutils::{assert_contract_error, Error};

#[test]
fn test_insufficient_faction_points() {
    let env = setup_test_env();
    let blendizzard = create_test_blendizzard(&env, &admin);

    let result = blendizzard.try_start_game(
        &game_contract,
        &session_id,
        &player1,
        &player2,
        &1000_0000000, // Wager too high
        &1000_0000000,
    );

    // Clean, type-safe assertion
    assert_contract_error(&result, Error::InsufficientFactionPoints);
}
```

### Migration Guide

#### Old Pattern (should_panic)
```rust
#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_fp_with_zero_vault_balance() {
    let env = setup_test_env();
    // ... setup code ...

    // This call panics
    blendizzard.start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );
}
```

#### New Pattern (assert_contract_error)
```rust
#[test]
fn test_fp_with_zero_vault_balance() {
    let env = setup_test_env();
    // ... setup code ...

    // Use try_ method and assert specific error
    let result = blendizzard.try_start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    assert_contract_error(&result, Error::InsufficientFactionPoints);
}
```

### Benefits of Migration

1. **Better Error Messages**: Instead of "test panicked", you get:
   ```
   Expected error InsufficientFactionPoints (code 11), but got InvalidAmount (code 12)
   ```

2. **Multiple Assertions**: Test multiple error conditions in one test:
   ```rust
   #[test]
   fn test_multiple_validation_errors() {
       let result1 = blendizzard.try_start_game(&zero_wager);
       assert_contract_error(&result1, Error::InvalidAmount);

       let result2 = blendizzard.try_select_faction(&invalid_faction);
       assert_contract_error(&result2, Error::InvalidFaction);
   }
   ```

3. **Compile-Time Safety**: Renaming `InsufficientFactionPoints` → `InsufficientFp` breaks tests at compile time, not runtime.

## Error Enum Reference

Our error definitions from `contracts/blendizzard/src/errors.rs`:

```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // Player errors (10-19)
    InsufficientFactionPoints = 11,
    InvalidAmount = 12,
    InvalidFaction = 13,
    FactionAlreadyLocked = 14,
    PlayerNotFound = 15,
    FactionNotSelected = 16,

    // Game errors (20-29)
    GameNotWhitelisted = 20,
    SessionNotFound = 21,
    SessionAlreadyExists = 22,
    InvalidSessionState = 23,
    InvalidGameOutcome = 24,
    GameExpired = 25,

    // Epoch errors (30-39)
    EpochNotFinalized = 30,
    EpochAlreadyFinalized = 31,
    EpochNotReady = 32,

    // Reward errors (40-49)
    NoRewardsAvailable = 40,
    RewardAlreadyClaimed = 41,
    NotWinningFaction = 42,

    // External contract errors (50-59)
    SwapError = 51,

    // Math errors (60-69)
    OverflowError = 60,
    DivisionByZero = 61,

    // Emergency errors (70-79)
    ContractPaused = 70,
}
```

## Helper Function Implementation

Located in `contracts/blendizzard/src/tests/testutils.rs`:

```rust
/// Assert that a Result contains a specific contract error
///
/// This helper provides type-safe error assertions following Stellar/Soroban best practices.
/// Instead of using numeric error codes or #[should_panic], this pattern:
/// - Provides compile-time error checking
/// - Makes tests more readable with named errors
/// - Gives better failure messages
pub fn assert_contract_error<T>(
    result: &Result<T, Result<Error, soroban_sdk::Error>>,
    expected_error: Error
)
where
    T: std::fmt::Debug,
{
    match result {
        Err(Ok(actual_error)) => {
            assert_eq!(
                *actual_error,
                expected_error,
                "Expected error {:?} (code {}), but got {:?} (code {})",
                expected_error,
                expected_error as u32,
                actual_error,
                *actual_error as u32
            );
        }
        Err(Err(host_error)) => {
            panic!(
                "Expected contract error {:?} (code {}), but got host error: {:?}",
                expected_error,
                expected_error as u32,
                host_error
            );
        }
        Ok(value) => {
            panic!(
                "Expected error {:?} (code {}), but operation succeeded with: {:?}",
                expected_error,
                expected_error as u32,
                value
            );
        }
    }
}
```

## Real-World Examples

### Example 1: Testing Invalid Faction Selection

```rust
#[test]
fn test_select_invalid_faction() {
    let env = setup_test_env();
    let admin = Address::generate(&env);
    let blendizzard = create_test_blendizzard(&env, &admin);
    let player = Address::generate(&env);

    // Try to select faction 3 (only 0, 1, 2 are valid)
    let result = blendizzard.try_select_faction(&player, &3);

    assert_contract_error(&result, Error::InvalidFaction);
}
```

### Example 2: Testing Locked Faction Change

```rust
#[test]
fn test_cannot_change_locked_faction() {
    let env = setup_test_env();
    let (game_contract, mock_vault, blendizzard) = setup_fp_test_env(&env);
    let player = Address::generate(&env);

    // Select faction and play a game (locks faction)
    blendizzard.select_faction(&player, &0); // WholeNoodle
    mock_vault.set_user_balance(&player, &1000_0000000);

    blendizzard.start_game(
        &game_contract,
        &1,
        &player,
        &Address::generate(&env),
        &100_0000000,
        &100_0000000,
    );

    // Try to change faction (should fail)
    let result = blendizzard.try_select_faction(&player, &1);

    assert_contract_error(&result, Error::FactionAlreadyLocked);
}
```

### Example 3: Testing Zero Vault Balance

```rust
#[test]
fn test_start_game_with_zero_balance() {
    let env = setup_test_env();
    let (game_contract, mock_vault, blendizzard) = setup_fp_test_env(&env);
    let player1 = Address::generate(&env);
    let player2 = Address::generate(&env);

    blendizzard.select_faction(&player1, &0);
    blendizzard.select_faction(&player2, &1);

    // Player1 has 0 balance
    mock_vault.set_user_balance(&player1, &0);
    mock_vault.set_user_balance(&player2, &1000_0000000);

    let result = blendizzard.try_start_game(
        &game_contract,
        &1,
        &player1,
        &player2,
        &100_0000000,
        &100_0000000,
    );

    assert_contract_error(&result, Error::InsufficientFactionPoints);
}
```

## References

- **soroswap/core**: https://github.com/soroswap/core/blob/main/contracts/pair/src/test/swap.rs
- **fee-vault-v2**: https://github.com/script3/fee-vault-v2/blob/main/src/tests/test_entrypoints.rs
- **blend-contracts-v2**: Research via DeepWiki
- **soroban-examples**: https://github.com/stellar/soroban-examples/blob/main/errors/src/test.rs

## Action Items

1. ✅ Create `assert_contract_error` helper in testutils.rs
2. 🔄 Migrate existing `#[should_panic]` tests to use `try_` methods
3. ⏳ Update all error assertions to use the helper function
4. ⏳ Add error testing examples to test documentation

---

**Last Updated:** 2025-01-14
**Status:** Helper created, migration in progress
