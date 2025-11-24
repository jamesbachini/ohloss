# Multi-Sig Auth Entry Injection - Fix Summary

## Problem

The multi-signature flow for Soroban authorization entries was failing with:
```
TypeError: Cannot set property simulationData of #<AssembledTransaction> which has only a getter
```

When Player 2 tried to inject Player 1's signed auth entry, the code attempted to reassign the `simulationData` property, which is read-only on `AssembledTransaction` objects.

## Root Cause

In `/Users/kalepail/Desktop/blendizzard/frontend/src/utils/authEntryUtils.ts`, the `injectSignedAuthEntry()` function was trying to create a new object and reassign it:

```typescript
// ❌ INCORRECT - simulationData is a getter-only property
tx.simulationData = {
  ...tx.simulationData,
  result: {
    ...tx.simulationData.result,
    auth: updatedAuthEntries,
  },
};
```

## Solution

**Use direct array mutation instead of object reassignment.**

Since `authEntries` is a reference to the actual array inside `tx.simulationData.result.auth`, we can mutate the array element directly:

```typescript
// ✅ CORRECT - Direct mutation of the array element
const authEntries = tx.simulationData.result.auth;
authEntries[matchIndex] = signedAuthEntry;
```

## Fixed Code

`frontend/src/utils/authEntryUtils.ts:140-148`:

```typescript
// DIRECTLY mutate the auth entry at the found index
// This works because authEntries is a reference to the actual array in simulationData
// We don't need to (and can't) reassign simulationData since it's a getter
authEntries[matchIndex] = signedAuthEntry;

console.log(`[injectSignedAuthEntry] ✅ Replaced stubbed auth entry at index ${matchIndex} for ${signerAddress}`);
console.log('[injectSignedAuthEntry] Successfully injected signed auth entry (direct mutation)');

return tx;
```

## Testing

### Test Files Created

1. **`test-complete-multisig.ts`** - Comprehensive end-to-end multi-sig flow test
   - Creates signed and stubbed auth entries
   - Simulates Player 2 importing Player 1's auth entry
   - Tests injection and signing flow
   - **Result**: ✅ PASSED

2. **`test-injection-validation.ts`** - Validates direct mutation approach
   - Creates mock AssembledTransaction structure
   - Tests direct array mutation
   - Verifies reference integrity
   - **Result**: ✅ PASSED

### Test Output

```
✅ SUCCESS! Direct mutation approach works correctly.
   The auth array reference is maintained, and the entry is properly signed.
```

### Validation Results

- ✅ Direct mutation maintains array reference
- ✅ Signed entry is properly injected at correct index
- ✅ Player 1 entry becomes signed (scvBytes)
- ✅ Player 2 entry remains stubbed (scvVoid)
- ✅ No other code tries to reassign simulationData

## Multi-Sig Flow Summary

### Step 1: Player 1 Prepares and Exports

```typescript
// Player 1 builds transaction with both players' auth entries
const player1Tx = await numberGuessClient.start_game({...});

// Player 1 signs their auth entry using authorizeEntry helper
const signedAuthEntry = await authorizeEntry(
  player1AuthEntry,
  async (preimage) => {
    const signResult = await wallet.signAuthEntry(preimage.toXDR('base64'), {...});
    return Buffer.from(signResult.signedAuthEntry, 'base64');
  },
  validUntilLedgerSeq,
  NETWORK_PASSPHRASE
);

// Player 1 exports signed auth entry as XDR
const authEntryXdr = signedAuthEntry.toXDR('base64');
```

### Step 2: Player 2 Imports and Rebuilds

```typescript
// Player 2 receives Player 1's signed auth entry XDR
const parsed = parseAuthEntry(player1AuthEntryXdr);

// Player 2 builds new transaction using parsed data
const player2Tx = await numberGuessClient.start_game({
  session_id: parsed.sessionId,
  player1: parsed.player1,
  player2: player2Address,
  player1_wager: parsed.player1Wager,
  player2_wager: player2Wager,
});
```

### Step 3: Player 2 Injects Signed Auth Entry

```typescript
// Inject Player 1's signed entry (replaces stubbed entry)
const updatedTx = injectSignedAuthEntry(
  player2Tx,
  player1AuthEntryXdr,
  parsed.player1
);
```

### Step 4: Player 2 Signs Their Own Auth Entry

```typescript
// Player 2 signs their own auth entry
await updatedTx.signAuthEntries({
  publicKey: player2Address,
  signAuthEntry: async (authEntry) => {
    const result = await wallet.signAuthEntry(authEntry, {...});
    return result.signedAuthEntry;
  },
});
```

### Step 5: Submit Transaction

```typescript
// Submit the fully signed transaction
const result = await updatedTx.signAndSend({
  signTransaction: async (tx) => {
    const result = await wallet.signTransaction(tx, {...});
    return result.signedTransaction;
  },
});
```

## Key Insights

1. **Auth entries are in simulation data**: After simulation, auth entries are in `tx.simulationData.result.auth`, NOT in `operation.auth` yet.

2. **Credential types matter**: Check credential type before accessing properties:
   - `sorobanCredentialsAddress` - Requires signing (Player 1)
   - `sorobanCredentialsSource` - Transaction source, no separate auth (Player 2 if tx source)

3. **Direct mutation works**: JavaScript array references allow direct mutation without reassignment.

4. **authorizeEntry is correct**: Use the `authorizeEntry` helper from stellar-sdk for proper signature generation.

5. **Auto-parsing improves UX**: Parse auth entry XDR on paste to auto-fill form fields.

## Files Modified

### Fixed
- ✅ `/Users/kalepail/Desktop/blendizzard/frontend/src/utils/authEntryUtils.ts` (line 143)
  - Changed from object reassignment to direct array mutation

### Already Correct
- ✅ `/Users/kalepail/Desktop/blendizzard/frontend/src/services/numberGuessService.ts`
  - Uses `authorizeEntry` helper correctly
  - Parsing logic correct
  - Auto-fill functionality implemented

- ✅ `/Users/kalepail/Desktop/blendizzard/frontend/src/components/NumberGuessGame.tsx`
  - Auto-parsing on textarea change works correctly

## Status

**✅ FIXED AND VALIDATED**

The multi-sig auth entry flow should now work correctly:
- Player 1 can export signed auth entry
- Player 2 can import and auto-fill form fields
- Player 2 can inject Player 1's signed entry
- Player 2 can sign their own entry
- Transaction can be submitted with both signatures

## Next Steps

Test the full end-to-end flow in the frontend application to confirm the fix works in production.
