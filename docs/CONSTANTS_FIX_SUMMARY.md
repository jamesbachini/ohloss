# Constants Audit & Fix Summary

## ✅ Changes Applied

### File: `frontend/src/utils/constants.ts`

---

### 1. **Multi-Sig Auth Entry Timeout - FIXED ✅**

**Before:**
```typescript
export const MULTI_SIG_AUTH_TTL_MINUTES = 60; // Multi-step flows (1 hour)
```

**After:**
```typescript
export const MULTI_SIG_AUTH_TTL_MINUTES = 1440; // Multi-step flows (24 hours)
```

**Impact:** Players now have 24 hours to complete multi-sig games instead of just 1 hour.

**Calculation:**
- 1440 minutes = 24 hours
- Ledgers: 1440 * 12 = 17,280
- With 20% safety margin: 17,280 * 1.2 = 20,736 ledgers
- Actual expiration: ~28.8 hours

---

### 2. **DEFAULT_METHOD_OPTIONS Fee - FIXED ✅**

**Before:**
```typescript
export const DEFAULT_FEE = '100000'; // Base fee in stroops
export const DEFAULT_METHOD_OPTIONS = {
  fee: 0, // 100000, // Higher fee for mainnet (100,000 stroops = 0.01 XLM)
  timeoutInSeconds: 30,
} as const;
```

**After:**
```typescript
export const DEFAULT_FEE = 100000; // Base fee in stroops (0.01 XLM)
export const DEFAULT_METHOD_OPTIONS = {
  fee: DEFAULT_FEE, // 100,000 stroops = 0.01 XLM
  timeoutInSeconds: 30,
} as const;
```

**Changes:**
- Changed DEFAULT_FEE from string '100000' to number 100000
- Changed fee from 0 to DEFAULT_FEE
- Now properly uses the constant

---

### 3. **Removed Unused Constants ✅**

**Removed:**
```typescript
// ❌ Removed - Not used anywhere
export const DEFAULT_TX_TIMEOUT = 300; // 5 minutes for single-sig
export const MULTI_SIG_TX_TIMEOUT = 600; // 10 minutes for multi-sig
export const EXTENDED_AUTH_TTL_MINUTES = 120; // Extended sessions (2 hours)
export const MIN_TOUCH_TARGET = 44; // Minimum touch target size in pixels
export const POLL_INTERVAL = 5000; // Poll for updates every 5 seconds
export const EPOCH_DURATION = 60; // From deployment in CHITSHEET.md
```

**Kept:**
```typescript
// ✅ Kept - Used in UI components
export const NOTIFICATION_DURATION = 5000; // 5 seconds
```

---

## 📊 Final Constants List

### Network Configuration ✅
- `NETWORK`
- `RPC_URL`
- `HORIZON_URL`
- `NETWORK_PASSPHRASE`

### Contract Addresses ✅
- `BLENDIZZARD_CONTRACT`
- `GAME_CONTRACT`
- `VAULT_CONTRACT`

### Token Addresses ✅
- `XLM_TOKEN`
- `USDC_TOKEN`
- `BLND_TOKEN`

### External Services ✅
- `SOROSWAP_ROUTER`
- `LAUNCHTUBE_URL`
- `LAUNCHTUBE_JWT`
- `TURNSTILE_SITE_KEY`

### Faction Configuration ✅
- `FACTIONS`
- `FACTION_NAMES`
- `FACTION_COLORS`

### Token Decimals ✅
- `USDC_DECIMALS = 7`
- `BLND_DECIMALS = 7`

### Transaction Settings ✅
- `DEFAULT_FEE = 100000` (number, not string)
- `DEFAULT_METHOD_OPTIONS = { fee: DEFAULT_FEE, timeoutInSeconds: 30 }`

### Authorization TTL ✅
- `DEFAULT_AUTH_TTL_MINUTES = 10` (single-sig, 10 minutes)
- `MULTI_SIG_AUTH_TTL_MINUTES = 1440` (multi-sig, 24 hours)

### UI Constants ✅
- `NOTIFICATION_DURATION = 5000` (5 seconds)

### Game Constants ✅
- `MIN_GUESS = 1`
- `MAX_GUESS = 10`

---

## 🔍 Verification

### Where Auth TTL is Used

**File:** `frontend/src/services/numberGuessService.ts`

**Multi-sig flow (prepareStartGame):**
```typescript
const validUntilLedgerSeq = authTtlMinutes
  ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
  : await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);
  // Now uses 1440 minutes (24 hours) ✅
```

**Single-sig flow (startGame):**
```typescript
const validUntilLedgerSeq = authTtlMinutes
  ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
  : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);
  // Uses 10 minutes ✅
```

### Where Fee is Used

**File:** `frontend/src/services/numberGuessService.ts`

All contract method calls use `DEFAULT_METHOD_OPTIONS`:
```typescript
const tx = await buildClient.start_game({
  session_id: sessionId,
  player1,
  player2,
  player1_wager: player1Wager,
  player2_wager: player2Wager,
}, DEFAULT_METHOD_OPTIONS); // Now includes fee: 100000 ✅
```

---

## 🎯 Summary

**Critical Issues Fixed:**
1. ✅ Multi-sig auth entries now expire in 24 hours (was 1 hour)
2. ✅ Transaction fee now set to 100000 stroops (was 0)
3. ✅ DEFAULT_FEE properly used in DEFAULT_METHOD_OPTIONS

**Cleanup:**
1. ✅ Removed 6 unused constants
2. ✅ Kept only actively used constants
3. ✅ Improved code clarity and maintainability

**Testing:**
- Auth entry signatures will now last 24+ hours
- Transactions will include proper fees (0.01 XLM)
- No breaking changes to existing functionality
