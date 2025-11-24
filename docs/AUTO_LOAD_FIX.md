# Auto-Load Fix - Game Existing Detection

## Problem

When opening a deep link URL **after** a game has been started (both players signed), the page shows an empty game screen instead of loading the game to the guess phase.

**User Report:** "once the game has started when using that link make sure the game itself loads up. Looks like it tries to but then I get this view [empty screen]"

## Root Cause

The auto-load logic had two issues:

### Issue 1: Wrong State Setting (Lines 130-131, 194-195)

**Before:**
```typescript
if (game) {
  console.log('[Deep Link] Game already exists, loading directly');
  setCreateMode('load');     // ❌ WRONG - should not set createMode
  setLoadSessionId(sessionId.toString());  // ❌ WRONG - not needed

  setGameState(game);
  setGamePhase('guess');
}
```

**Problem:** Setting `createMode='load'` causes the component to think it's in the "Load Existing Game" form mode, not the actual game phase. This creates a state conflict where `gamePhase='guess'` but the component is trying to render the load form.

### Issue 2: Poor Error Logging (Lines 148, 212)

**Before:**
```typescript
.catch((err) => {
  console.log('[Deep Link] Error checking game existence:', err.message);
  // ...
});
```

**Problem:** Only logging `err.message` doesn't show the full error details. If the error object doesn't have a message property, or if it's a non-standard error, we get an empty log (which is what the user was seeing in console).

## Solution Applied

### Fix 1: Remove CreateMode Setting

**After:**
```typescript
if (game) {
  console.log('[Deep Link] Game already exists, loading directly to guess phase');
  console.log('[Deep Link] Game data:', game);

  // Auto-load the game - bypass create phase entirely
  setGameState(game);
  setGamePhase('guess');
  setSessionId(sessionId); // ✅ Set session ID for the game
}
```

**Changes:**
- Removed `setCreateMode('load')` - no longer needed
- Removed `setLoadSessionId()` - no longer needed
- Added `setSessionId(sessionId)` - ensures session ID is set for the game
- Added game data logging for debugging

**Why this works:**
- `gamePhase='guess'` triggers rendering of the game UI (line 950)
- `gameState` contains the game data
- No `createMode` conflict - component knows it's in game phase, not setup phase

### Fix 2: Better Error Logging

**After:**
```typescript
.catch((err) => {
  console.error('[Deep Link] Error checking game existence:', err);
  console.error('[Deep Link] Error details:', {
    message: err?.message,
    stack: err?.stack,
    sessionId: sessionId,
  });
  // ...
});
```

**Changes:**
- Changed from `console.log` to `console.error` (easier to spot)
- Log full error object first
- Then log structured error details with message, stack, and session ID
- Helps debug why game existence check might be failing

## Files Modified

**frontend/src/components/NumberGuessGame.tsx**

1. **Lines 124-161:** Fixed initialXDR prop flow
   - Removed `setCreateMode('load')` (line 130)
   - Removed `setLoadSessionId()` (line 131)
   - Added `setSessionId(sessionId)` (line 135)
   - Improved error logging (lines 148-153)

2. **Lines 188-225:** Fixed URL parameter flow
   - Removed `setCreateMode('load')` (line 194)
   - Removed `setLoadSessionId()` (line 195)
   - Added `setSessionId(sessionId)` (line 199)
   - Improved error logging (lines 212-217)

## Expected Behavior

### Scenario 1: Game Doesn't Exist Yet

1. Player 1 creates and exports auth entry
2. Player 2 opens deep link URL
3. Game existence check: `numberGuessService.getGame(sessionId)` returns null or errors
4. **Result:** Shows Import mode with pre-filled fields ✅

### Scenario 2: Game Already Exists

1. Player 1 creates and exports auth entry
2. Player 2 imports and signs → game created on-chain
3. Anyone opens the same deep link URL
4. Game existence check: `numberGuessService.getGame(sessionId)` returns game data
5. **Result:** Loads directly to guess phase with game data ✅

**Game UI shows:**
- Player 1 and Player 2 addresses
- Both players' wagers
- Guess status for each player
- Guess input (if not guessed yet)
- Reveal button (if both guessed)

## State Flow Diagram

```
Deep Link URL Opened
    ↓
GamesCatalog detects auth param → setInitialXDR()
    ↓
NumberGuessGame receives initialXDR prop
    ↓
useEffect: parse auth entry → get session ID
    ↓
numberGuessService.getGame(sessionId)
    ↓
    ├─ Game Exists? YES
    │   ├─ setGameState(game) ✅
    │   ├─ setGamePhase('guess') ✅
    │   ├─ setSessionId(sessionId) ✅
    │   └─ Component renders game UI ✅
    │
    └─ Game Exists? NO (or Error)
        ├─ setCreateMode('import') ✅
        ├─ setImportAuthEntryXDR() ✅
        ├─ Pre-fill all fields ✅
        └─ Component renders import form ✅
```

## Component Rendering Logic

The component decides what to render based on `gamePhase` and `gameState`:

```typescript
// Line 637: Setup phase
{gamePhase === 'create' && (
  // Shows Create/Import/Load forms
)}

// Line 950: Game phase
{gamePhase === 'guess' && gameState && (
  // Shows actual game UI with players, wagers, guess buttons
)}

// Line 1037: Reveal phase
{gamePhase === 'reveal' && gameState && (
  // Shows reveal button and results
)}

// Line 1059: Complete phase
{gamePhase === 'complete' && gameState && (
  // Shows winner and final results
)}
```

**Key condition:** `gamePhase === 'guess' && gameState`

Both must be true for game UI to render. If `gamePhase='guess'` but `gameState` is null/undefined, the condition fails and nothing renders (empty screen).

## Testing

**Test Case 1: New Game (Import Mode)**
```bash
# 1. Create auth entry as Player 1
# 2. Copy share URL
# 3. Open URL → Should show Import mode ✅
# 4. Check console:
#    - "[Deep Link] Using initialXDR prop from GamesCatalog"
#    - "[Deep Link] Error checking game existence:" (expected - game doesn't exist)
#    - "[Deep Link] Game not found, entering import mode"
```

**Test Case 2: Existing Game (Auto-Load)**
```bash
# 1. Create auth entry as Player 1
# 2. Import and sign as Player 2 → game created
# 3. Open the same URL again → Should load to guess phase ✅
# 4. Check console:
#    - "[Deep Link] Using initialXDR prop from GamesCatalog"
#    - "[Deep Link] Game already exists, loading directly to guess phase"
#    - "[Deep Link] Game data: {player1, player2, ...}"
# 5. Verify game UI shows:
#    - Both player addresses
#    - Both wagers
#    - Guess status
#    - Guess input (if applicable)
```

## Status

✅ **Auto-load fix applied**
✅ **Better error logging added**
✅ **State conflicts resolved**
✅ **Ready for testing**

## Next Steps

1. Test with a real game flow:
   - Create game as Player 1
   - Import as Player 2
   - Open link again → should load to guess phase
2. Check console logs for any errors
3. If game existence check still fails, investigate `numberGuessService.getGame()` method
