# Frontend Constants Audit & Recommendations

## 🔴 Critical Issues

### 1. **Auth Entry Signature Timeout - TOO SHORT**

**Current:** 60 minutes (1 hour) for multi-sig
**Required:** 1440 minutes (24 hours)

**Location:** `/Users/kalepail/Desktop/blendizzard/frontend/src/utils/constants.ts:86`

```typescript
// ❌ CURRENT (TOO SHORT)
export const MULTI_SIG_AUTH_TTL_MINUTES = 60; // Multi-step flows (1 hour)

// ✅ SHOULD BE
export const MULTI_SIG_AUTH_TTL_MINUTES = 1440; // Multi-step flows (24 hours)
```

**Impact:** Players have only 1 hour to complete multi-sig games. This is too restrictive for asynchronous gameplay.

**Fix:** Change to 1440 minutes (24 hours)

---

### 2. **DEFAULT_METHOD_OPTIONS Fee Set to 0**

**Location:** `/Users/kalepail/Desktop/blendizzard/frontend/src/utils/constants.ts:79`

```typescript
// ❌ INCORRECT
export const DEFAULT_METHOD_OPTIONS = {
  fee: 0, // 100000, // Higher fee for mainnet (100,000 stroops = 0.01 XLM)
  timeoutInSeconds: 30,
} as const;
```

**Issue:** Fee is set to 0, which may cause transaction failures. The commented value suggests it should be 100000.

**Fix:** Either:
1. Use `DEFAULT_FEE` constant (100000)
2. Remove the fee field and let stellar-sdk handle it
3. Set to a reasonable value like 100000

**Recommendation:**
```typescript
export const DEFAULT_METHOD_OPTIONS = {
  fee: DEFAULT_FEE, // 100,000 stroops = 0.01 XLM
  timeoutInSeconds: 30,
} as const;
```

---

## ⚠️  Unused Constants

### 3. **EXTENDED_AUTH_TTL_MINUTES - UNUSED**

**Location:** Line 87

```typescript
export const EXTENDED_AUTH_TTL_MINUTES = 120; // Extended sessions (2 hours)
```

**Usage:** Not used anywhere in the codebase

**Recommendation:** Remove or document intended use case

---

### 4. **Transaction Timeouts - UNUSED**

**Location:** Lines 72-73

```typescript
export const DEFAULT_TX_TIMEOUT = 300; // 5 minutes for single-sig
export const MULTI_SIG_TX_TIMEOUT = 600; // 10 minutes for multi-sig
```

**Usage:** Not used anywhere

**Note:** `DEFAULT_METHOD_OPTIONS.timeoutInSeconds` is used instead (30 seconds)

**Recommendation:** Remove these or use them in `DEFAULT_METHOD_OPTIONS`

---

### 5. **DEFAULT_FEE - UNUSED**

**Location:** Line 74

```typescript
export const DEFAULT_FEE = '100000'; // Base fee in stroops
```

**Usage:** Not used anywhere (but SHOULD be used in DEFAULT_METHOD_OPTIONS)

**Recommendation:** Use this in `DEFAULT_METHOD_OPTIONS.fee`

---

### 6. **UI Constants - UNUSED**

**Location:** Lines 90-92

```typescript
export const MIN_TOUCH_TARGET = 44; // Minimum touch target size in pixels
export const NOTIFICATION_DURATION = 5000; // 5 seconds
export const POLL_INTERVAL = 5000; // Poll for updates every 5 seconds
```

**Usage:** None of these are used in the codebase

**Recommendation:** Remove or implement where appropriate

---

### 7. **EPOCH_DURATION - UNUSED**

**Location:** Line 65

```typescript
export const EPOCH_DURATION = 60; // From deployment in CHITSHEET.md
```

**Usage:** Not used in frontend (contract handles this)

**Issue:** Set to 60 seconds for testing, but comment says 345600 for production (4 days)

**Recommendation:** Either:
1. Remove (frontend doesn't need this, queries contract config)
2. Update comment to clarify this is just documentation
3. Use contract's `getConfig()` to get actual value

---

## 📊 Summary

### ✅ Used & Correct
- `NETWORK`, `RPC_URL`, `HORIZON_URL`, `NETWORK_PASSPHRASE` ✅
- Contract addresses (BLENDIZZARD_CONTRACT, GAME_CONTRACT, VAULT_CONTRACT) ✅
- Token addresses (XLM_TOKEN, USDC_TOKEN, BLND_TOKEN) ✅
- SOROSWAP_ROUTER ✅
- LAUNCHTUBE_URL, LAUNCHTUBE_JWT ✅
- TURNSTILE_SITE_KEY ✅
- FACTIONS, FACTION_NAMES, FACTION_COLORS ✅
- USDC_DECIMALS, BLND_DECIMALS ✅
- DEFAULT_AUTH_TTL_MINUTES ✅ (used, but value might be too short)
- MULTI_SIG_AUTH_TTL_MINUTES ✅ (used, but **TOO SHORT** - needs to be 24 hours)
- DEFAULT_METHOD_OPTIONS ✅ (used, but fee is 0)
- MIN_GUESS, MAX_GUESS ✅

### 🔴 Critical Issues (Needs Immediate Fix)
1. **MULTI_SIG_AUTH_TTL_MINUTES** - Change from 60 to 1440 (24 hours)
2. **DEFAULT_METHOD_OPTIONS.fee** - Change from 0 to DEFAULT_FEE or reasonable value

### ⚠️  Unused (Consider Removing)
1. EXTENDED_AUTH_TTL_MINUTES
2. DEFAULT_TX_TIMEOUT
3. MULTI_SIG_TX_TIMEOUT
4. DEFAULT_FEE (unused but should be used!)
5. MIN_TOUCH_TARGET
6. NOTIFICATION_DURATION
7. POLL_INTERVAL
8. EPOCH_DURATION

---

## 🔧 Recommended Changes

### File: `/Users/kalepail/Desktop/blendizzard/frontend/src/utils/constants.ts`

```typescript
// Transaction settings
export const DEFAULT_FEE = '100000'; // Base fee in stroops (0.01 XLM)

// Default options for all contract method calls
export const DEFAULT_METHOD_OPTIONS = {
  fee: DEFAULT_FEE, // ✅ Use the constant instead of 0
  timeoutInSeconds: 30,
} as const;

// Authorization entry TTL settings
// Controls how long authorization signatures remain valid (in minutes)
export const DEFAULT_AUTH_TTL_MINUTES = 10; // Standard operations (10 minutes)
export const MULTI_SIG_AUTH_TTL_MINUTES = 1440; // ✅ Multi-step flows (24 hours)

// Remove unused constants:
// - EXTENDED_AUTH_TTL_MINUTES (not used)
// - DEFAULT_TX_TIMEOUT (not used)
// - MULTI_SIG_TX_TIMEOUT (not used)
// - MIN_TOUCH_TARGET (not used)
// - NOTIFICATION_DURATION (not used, hardcoded where needed)
// - POLL_INTERVAL (not used)
// - EPOCH_DURATION (contract config handles this)
```

---

## 📝 Auth Entry Expiration Math

**Ledger Time:** ~5 seconds per ledger
**Ledgers per minute:** 12
**Ledgers per hour:** 720
**Ledgers per day:** 17,280

**For 24 hours (1440 minutes):**
- Ledgers: 1440 * 12 = 17,280
- With 20% safety margin: 17,280 * 1.2 = 20,736 ledgers
- Total time: ~28.8 hours (accounting for safety margin)

This gives players a comfortable 24+ hour window to complete multi-sig games.

---

## 🔍 Where Auth TTL is Used

**File:** `frontend/src/services/numberGuessService.ts`

**Line 159:**
```typescript
const validUntilLedgerSeq = authTtlMinutes
  ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
  : await calculateValidUntilLedger(RPC_URL, MULTI_SIG_AUTH_TTL_MINUTES);
```

**Line 77 (single-sig games):**
```typescript
const validUntilLedgerSeq = authTtlMinutes
  ? await calculateValidUntilLedger(RPC_URL, authTtlMinutes)
  : await calculateValidUntilLedger(RPC_URL, DEFAULT_AUTH_TTL_MINUTES);
```

**Function:** `calculateValidUntilLedger()` in `frontend/src/utils/ledgerUtils.ts`
- Fetches current ledger
- Adds TTL in ledgers (minutes * 12)
- Adds 20% safety margin
- Returns `validUntilLedgerSeq`
