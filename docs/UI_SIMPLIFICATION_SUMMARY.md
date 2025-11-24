# Multi-Sig UI Simplification - Summary

## Changes Made

### 1. Create & Export Flow Simplified

**Removed Player 2 Inputs:**
- ❌ Removed "Player 2 Address" input field
- ❌ Removed "Player 2 Wager" input field

**Why:** Player 2 will specify their own address and wager when they import the auth entry. Player 1 only needs to sign their portion.

**What Player 1 Now Sees:**
- ✅ Your Address (Player 1) - auto-filled, read-only
- ✅ Your Wager (FP) - user input
- ✅ Info box explaining that Player 2 will specify their own details

**Behind the Scenes:**
- Uses placeholder values for simulation:
  - Player 2 Address: `GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB` (known testnet address)
  - Player 2 Wager: Same as Player 1's wager
- These are only for getting simulation to pass - Player 2 rebuilds with real values

### 2. Import Auth Entry - Auto-Fill Improvements

**Now Prefills:**
- ✅ Session ID (auto-filled from auth entry)
- ✅ Player 1 Address (auto-filled from auth entry)
- ✅ Player 1 Wager (auto-filled from auth entry)
- ✅ **Your Wager - now defaults to 0.1** (user can change)

**How It Works:**
1. Player 2 pastes auth entry XDR
2. Fields auto-fill from parsing the auth entry
3. "Your Wager" pre-filled with 0.1 (matching Create & Export default)
4. Player 2 only needs to adjust wager if desired, then click "Import & Sign"

### 3. Share URLs Simplified

**Old URL Format (verbose):**
```
?game=number-guess&session-id=123&p1=GABC...&p2=GDEF...&p1w=100&p2w=100&auth=AAAA...
```

**New URL Format (simplified):**
```
?game=number-guess&auth=AAAA...
```

**Why Simpler:**
- Auth entry contains all Player 1 info (session ID, address, wager)
- Player 2 info is not needed in URL (they specify when importing)
- Shorter URLs, easier to share

**Load Existing Game URL (unchanged):**
```
?game=number-guess&session-id=123
```

### 4. Code Changes

#### `NumberGuessGame.tsx`

**Lines 615-649: Simplified Create & Export UI**
```typescript
// Removed 2-column grid with Player 2 inputs
// Now single-column with just Player 1 info + info box
<div className="space-y-4">
  {/* Your Address */}
  {/* Your Wager */}
  {/* Info box explaining Player 2 will specify their own details */}
</div>
```

**Lines 137-166: Updated `handlePrepareTransaction()`**
```typescript
// Removed Player 2 validation
// Use placeholder values for simulation only
const placeholderPlayer2Address = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';
const placeholderP2Wager = p1Wager;
```

**Lines 404-423: Simplified `copyShareGameUrlWithAuthEntry()`**
```typescript
// URL now only includes game type and auth entry
const params = new URLSearchParams({
  'game': 'number-guess',
  'auth': exportedAuthEntryXDR,
});
```

**Lines 108-146: Updated URL parsing in `useEffect()`**
```typescript
if (authEntry) {
  // Parse auth entry to auto-fill fields
  // Prefill Player 2 wager with 0.1
  setImportPlayer2Wager('0.1');
}
```

**Lines 714-737: Updated textarea onChange for auto-parsing**
```typescript
// Added Player 2 wager prefill
setImportPlayer2Wager('0.1');
```

## User Flow (After Changes)

### Player 1: Create & Export

1. Enter your wager (e.g., 0.1 FP)
2. Click "Prepare & Export Auth Entry"
3. Copy auth entry XDR or share URL
4. Send to Player 2

**That's it!** No need to know Player 2's address or wager.

### Player 2: Import & Complete

1. Receive auth entry XDR or URL from Player 1
2. If URL: auto-loads. If XDR: paste into textarea
3. Auto-filled: Session ID, Player 1 address, Player 1 wager
4. Pre-filled: Your wager (0.1) - adjust if needed
5. Click "Import & Sign Auth Entry"
6. Done!

## Technical Details

### Why Placeholder Values Work

The key insight: **Player 1's exported auth entry only contains Player 1's authorization**. It doesn't lock in Player 2's address or wager.

When Player 2 imports and rebuilds the transaction:
1. Player 2 creates a NEW transaction with their own address and wager
2. Player 2 injects Player 1's signed auth entry (contains only P1's signature)
3. Player 2 signs their own auth entry
4. Both signatures are now in the transaction
5. Transaction submitted

The placeholder values used during Player 1's simulation are **not** included in the final transaction.

### Simulation Requirements

For simulation to pass, we need valid-looking addresses. That's why we use a known testnet address as placeholder. The specific address doesn't matter because:
- It's only used to get simulation auth entries
- Player 2 rebuilds the transaction with real addresses
- The final transaction uses Player 2's actual address, not the placeholder

## Benefits

1. **Simpler UX**: Player 1 doesn't need to collect Player 2's info upfront
2. **Shorter URLs**: Easier to share via chat/social
3. **More Flexible**: Players can coordinate asynchronously
4. **Clearer Intent**: UI makes it clear that Player 2 specifies their own details
5. **Fewer Errors**: Less chance of Player 1 entering wrong Player 2 address

## Compatibility

✅ **Backward Compatible**: Old URLs with full parameters will still work (though not generated anymore)

✅ **Forward Compatible**: New simplified URLs are cleaner and easier to maintain

## Testing Checklist

- [ ] Create & Export works with just Player 1 wager
- [ ] Share URL contains only auth entry (no p1, p2, p1w, p2w)
- [ ] Import from URL auto-fills correctly
- [ ] Import from pasted XDR auto-fills correctly
- [ ] Player 2 wager pre-filled with 0.1
- [ ] Full multi-sig flow completes successfully
- [ ] Old URL format still works (if provided)

## Files Modified

1. `/Users/kalepail/Desktop/blendizzard/frontend/src/components/NumberGuessGame.tsx`
   - Simplified Create & Export UI
   - Updated `handlePrepareTransaction()` to use placeholders
   - Simplified `copyShareGameUrlWithAuthEntry()`
   - Updated URL parsing logic
   - Added auto-prefill for Player 2 wager (0.1)

2. `/Users/kalepail/Desktop/blendizzard/bunt/test-stub-player2.ts` (created)
   - Test to validate placeholder address approach

## Next Steps

1. Test the full flow in the frontend
2. Verify share URLs work correctly
3. Confirm Player 2 can import and complete transaction
4. Update any documentation/help text to reflect new flow
