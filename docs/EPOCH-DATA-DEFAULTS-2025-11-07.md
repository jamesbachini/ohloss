# Epoch Data Defaults Design - November 7, 2025

## Summary

✅ **CLARIFIED** - `get_epoch_player()` correctly returns valid defaults for players who exist but haven't played this epoch yet

**Changes**: Reverted attempted NoEpochData error, kept PlayerNotFound error
**Tests**: 72/72 passing ✅
**Build**: Successful ✅
**Warnings**: 0 ✅

## Design Question

After implementing the `PlayerNotFound` error for `get_player()`, the question arose: Should `get_epoch_player()` also return an error when epoch data doesn't exist?

### Player's Question
> "Why do we have a default EpochPlayer. We should just error right?"

This led to implementing a `NoEpochData` error that returned an error when a player exists but has no epoch data. However, this broke 2 tests and revealed a fundamental design issue.

## The Key Insight

**There are TWO different scenarios for missing data:**

1. **Player doesn't exist at all** → ERROR condition
   - Player has never interacted with the contract
   - Returning defaults would be misleading (player appears to exist)
   - Correct response: `Error::PlayerNotFound`

2. **Player exists but hasn't played this epoch** → VALID state
   - Player has deposited/selected faction but hasn't started a game this epoch
   - These are real, accurate values: 0 FP, no faction locked, 0 withdrawals
   - Returning defaults is semantically correct
   - Correct response: `EpochPlayer` with zero values

## Semantic Analysis

### What does "no epoch data" mean?

When a player exists (has a `Player` record) but has no `EpochPlayer` record for the current epoch, this represents a **valid initial state**:

| Field | Value | Meaning |
|-------|-------|---------|
| `epoch_faction` | `None` | Faction not yet locked for this epoch (will lock on first game) |
| `available_fp` | `0` | No faction points earned yet this epoch |
| `locked_fp` | `0` | No faction points locked in games |
| `total_fp_contributed` | `0` | No contributions to faction standings yet |
| `withdrawn_this_epoch` | `0` | No withdrawals this epoch |
| `initial_epoch_balance` | `player.total_deposited` | Current deposit balance |

**These are not "missing" values** - they are the actual state for a player who hasn't played yet.

### Analogy

Think of it like a bank account:
- **Account doesn't exist**: Return error (player has never opened an account)
- **Account exists with $0 balance**: Return balance of $0 (valid state, not an error)

Similarly:
- **Player doesn't exist**: Return `PlayerNotFound` error (never interacted with contract)
- **Player exists with 0 FP**: Return `EpochPlayer` with zeros (valid state, just hasn't played)

## Implementation

### Final Design (CORRECT)

```rust
pub fn get_epoch_player(env: Env, player: Address) -> Result<types::EpochPlayer, Error> {
    // Level 1: Verify player exists
    let player_data = storage::get_player(&env, &player).ok_or(Error::PlayerNotFound)?;

    // Level 2: Get epoch data, use valid defaults if missing
    let current_epoch = storage::get_current_epoch(&env);
    let epoch_player =
        storage::get_epoch_player(&env, current_epoch, &player).unwrap_or(types::EpochPlayer {
            epoch_faction: None,                            // Not locked yet
            available_fp: 0,                                // No FP earned
            locked_fp: 0,                                   // No FP locked
            total_fp_contributed: 0,                        // No contributions
            withdrawn_this_epoch: 0,                        // No withdrawals
            initial_epoch_balance: player_data.total_deposited, // Current deposits
        });

    Ok(epoch_player)
}
```

**Two-level validation**:
1. **Player level**: Must exist → Error if not
2. **Epoch level**: May not exist → Defaults if missing (valid state)

### What Was Attempted (INCORRECT)

```rust
// WRONG: Treating missing epoch data as an error
pub fn get_epoch_player(env: Env, player: Address) -> Result<types::EpochPlayer, Error> {
    storage::get_player(&env, &player).ok_or(Error::PlayerNotFound)?;
    let current_epoch = storage::get_current_epoch(&env);
    storage::get_epoch_player(&env, current_epoch, &player).ok_or(Error::NoEpochData)
    //                                                          ^^^^^^^^^^^^^^^^^^^^
    //                                                          WRONG! This is a valid state
}
```

**Problems with this approach**:
1. Breaks legitimate queries before first game
2. Forces frontends to handle errors for normal states
3. Semantically incorrect - not an error condition
4. Confusing API - why is "no data yet" an error?

## Test Failures

When implementing the NoEpochData error, 2 tests failed:

### Test 1: `test_game_outcome_and_fp_transfer`
```rust
// Test flow:
client.deposit(&winner, &1000_0000000);         // Player now exists
let winner_initial = client.get_epoch_player(&winner); // ← FAILS with NoEpochData

// Player has deposited but not played yet - this is a VALID state to query!
// Frontend might want to show: "You have 0 FP this epoch, start playing to earn more"
```

### Test 2: `test_large_withdrawal_resets_timestamp`
```rust
// Test flow:
client.deposit(&player, &1000_0000000);           // Player now exists
let epoch_player = client.get_epoch_player(&player); // ← FAILS with NoEpochData

// Player exists, just hasn't played - should return zeros, not error
```

## Use Cases

### Frontend Example 1: Dashboard Display

**With Defaults (CORRECT)**:
```typescript
try {
  const player = await contract.get_player({ player: address });
  const epochUser = await contract.get_epoch_player({ player: address });

  // Always succeeds if player exists
  console.log(`Faction: ${player.selected_faction}`);
  console.log(`Available FP: ${epochUser.available_fp}`); // Shows 0 if not played yet
  console.log(`Locked FP: ${epochUser.locked_fp}`);       // Shows 0 if not played yet

} catch (error) {
  if (error.type === 'PlayerNotFound') {
    // Clear error: player doesn't exist, show onboarding
    console.log('Welcome! Please deposit to get started.');
  }
}
```

**With Error (WRONG)**:
```typescript
try {
  const player = await contract.get_player({ player: address });
  // Player exists...

  try {
    const epochUser = await contract.get_epoch_player({ player: address });
    // Show FP data
  } catch (epochError) {
    if (epochError.type === 'NoEpochData') {
      // Confusing! Player exists but we have to handle another error?
      // What should we show? Is this an error or just "no data yet"?
      console.log('Player exists but... no epoch data? What does that mean?');
    }
  }

} catch (error) {
  if (error.type === 'PlayerNotFound') {
    console.log('Player not found');
  }
}
```

### Frontend Example 2: Game Lobby

**With Defaults (CORRECT)**:
```typescript
// Show eligible players for matchmaking
const players = await Promise.all(
  addresses.map(async addr => {
    try {
      const player = await contract.get_player({ player: addr });
      const epochUser = await contract.get_epoch_player({ player: addr });

      // Clean, simple: always works for existing players
      return {
        address: addr,
        faction: player.selected_faction,
        availableFP: epochUser.available_fp, // 0 if not played yet - that's fine!
        canPlay: true
      };
    } catch (e) {
      // Only fails for non-existent players
      return null;
    }
  })
);
```

**With Error (WRONG)**:
```typescript
const players = await Promise.all(
  addresses.map(async addr => {
    try {
      const player = await contract.get_player({ player: addr });

      try {
        const epochUser = await contract.get_epoch_player({ player: addr });
        return { availableFP: epochUser.available_fp };
      } catch (epochError) {
        // Player exists but no epoch data - do we show them or not?
        // Is this an error or just "hasn't played yet"?
        // Need to handle this separately, making code complex
        return { availableFP: 0 }; // Just defaulting anyway!
      }
    } catch (e) {
      return null;
    }
  })
);
// More error handling for the same result!
```

## Comparison with Other Functions

### Consistent Pattern Across Contract

| Function | Data Missing | Behavior | Reason |
|----------|--------------|----------|--------|
| `get_player()` | Player doesn't exist | ❌ Return `PlayerNotFound` error | Invalid state - player never interacted |
| `get_epoch_player()` | Player doesn't exist | ❌ Return `PlayerNotFound` error | Invalid state - player never interacted |
| `get_epoch_player()` | Epoch data missing | ✅ Return defaults | Valid state - player exists, just hasn't played |
| `get_epoch()` | Epoch doesn't exist | ❌ Return `EpochNotFinalized` error | Invalid state - epoch number out of range |
| `get_faction_standings()` | Epoch doesn't exist | ❌ Return error | Invalid state - can't get standings for non-existent epoch |

**The pattern**:
- Entity doesn't exist → Error
- Entity exists but has no activity → Valid defaults

## Benefits of Default Approach

### 1. **Simpler Client Code** 📱
```typescript
// One try/catch instead of nested error handling
try {
  const player = await contract.get_player({ player: address });
  const epochPlayer = await contract.get_epoch_player({ player: address });
  // Use data - always works if player exists
} catch (e) {
  // Only handle true errors (player doesn't exist)
}
```

### 2. **Semantically Correct** 🎯
- A player with 0 FP this epoch IS accurate data
- Not an error condition, just an initial state
- Matches real-world understanding

### 3. **Consistent with Contract Logic** ⚙️
```rust
// When a player starts their first game, we do this:
let mut epoch_player = storage::get_epoch_player(env, current_epoch, player)
    .unwrap_or(types::EpochPlayer {
        epoch_faction: None,
        available_fp: 0,
        // ... (same defaults)
    });

// If defaults are valid for internal logic, they're valid for queries
```

### 4. **Better UX** ✨
Players who have deposited but not played yet can see:
- "You have 0 FP this epoch - start playing to earn more!"

Instead of:
- "Error: No epoch data" (confusing!)

### 5. **Fewer Edge Cases** 🛡️
No need to handle special case of "player exists but no epoch data"
- One error type to handle: `PlayerNotFound`
- Everything else is valid data

## Design Principle

> **Error vs Empty State**
>
> Return errors for **invalid conditions** (can't perform operation).
> Return empty/zero data for **valid but inactive** states.

### Examples in Blendizzard:

| Scenario | State Type | Response |
|----------|------------|----------|
| Query non-existent player | Invalid | Error |
| Query player with no deposits | Valid (empty) | `Player { ..., total_deposited: 0 }` |
| Query player with no FP yet | Valid (empty) | `EpochPlayer { ..., available_fp: 0 }` |
| Query non-existent epoch | Invalid | Error |
| Query epoch with no games | Valid (empty) | `EpochInfo { ..., faction_standings: {} }` |

## Documentation Updates

Updated `get_epoch_player()` documentation to clarify:

```rust
/// Get player's epoch-specific information
///
/// Returns complete epoch-specific data including locked faction, available/locked FP,
/// total FP contributed, withdrawals, and initial epoch balance.
///
/// If the player exists but hasn't played this epoch yet, returns a valid EpochPlayer with:
/// - No faction locked (epoch_faction = None)
/// - Zero faction points (available_fp = 0, locked_fp = 0)
/// - No contributions or withdrawals (total_fp_contributed = 0, withdrawn_this_epoch = 0)
/// - Initial balance matching current deposits
///
/// # Errors
/// * `PlayerNotFound` - If player has never interacted with the contract
```

## Related Changes

### Removed from errors.rs:
```rust
/// Player has not played any games this epoch (no epoch data yet)
NoEpochData = 16,  // ← REMOVED - not needed
```

Error code 16 is now available for future use.

## Verification

### Tests: ✅ All 72 passing
```bash
cargo test --lib
# test result: ok. 72 passed; 0 failed
```

### Build: ✅ Successful
```bash
stellar contract build
# Build Complete - 27 functions exported, 0 warnings
```

### Specific Tests Verified:
- ✅ `test_game_outcome_and_fp_transfer` - Queries epoch data before first game
- ✅ `test_large_withdrawal_resets_timestamp` - Queries epoch data before first game
- ✅ All other 70 tests - No regressions

## Conclusion

**Decision**: Return valid defaults when epoch data doesn't exist (player exists but hasn't played yet)

**Reasoning**:
1. **Semantically correct** - Zero values represent the actual state
2. **Simpler API** - One error type (`PlayerNotFound`) instead of two
3. **Better UX** - Frontends can show "0 FP" instead of handling errors
4. **Consistent pattern** - Matches how contract uses defaults internally

**Error codes**:
- ✅ `PlayerNotFound = 15` - Used when player doesn't exist
- ❌ `NoEpochData = 16` - REMOVED (not needed)

**Status**: ✅ **FINALIZED**

---

**Related Documents:**
- `USER-QUERY-ERROR-HANDLING-2025-11-07.md` - Initial PlayerNotFound error implementation
- `FACTION-SWITCHING-FLEXIBILITY-2025-11-07.md` - Faction preference flexibility
- `UPDATE-CONFIG-ENHANCEMENT-2025-11-07.md` - Config update flexibility
- `PAUSE-STATE-SEPARATION-FIX-2025-11-07.md` - Pause state optimization
- `ADMIN-DUPLICATION-FIX-2025-11-07.md` - Admin storage separation

**Design Lesson**:
Not all missing data represents an error. Distinguish between:
- **Invalid state**: Entity doesn't exist → Return error
- **Valid empty state**: Entity exists but inactive → Return defaults/zeros
