# Blendizzard Migration Guide

This guide explains how to migrate existing player data after the user→player terminology standardization.

## What Changed?

### Player Data (Persistent Storage)
- **V0 → V2**: Old `total_deposited` field → new `last_epoch_balance` field
- **V1 → V2**: Old `deposit_timestamp` field → new `time_multiplier_start` field
- **Storage Key**: `DataKey::User` → `DataKey::Player`

### EpochPlayer Data (Temporary Storage)
- **Storage Key Only**: `DataKey::EpochUser` → `DataKey::EpochPlayer`
- The struct itself is unchanged

## Migration Script

The `migrate-all.ts` script automatically migrates all player data.

### Prerequisites

```bash
# Ensure Bun is installed
bun --version

# Install dependencies
cd bunt
bun install
```

### Configuration

Set these environment variables:

```bash
# REQUIRED
export ADMIN_SECRET="S..."  # Admin keypair secret
export BLENDIZZARD_ID="C..."  # Contract address

# OPTIONAL
export RPC_URL="https://rpc.lightsail.network"  # Default: mainnet RPC
export NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"  # Default: mainnet
export PLAYER_ADDRESSES="GADDR1...,GADDR2...,GADDR3..."  # Comma-separated list (optional)
export EPOCHS_TO_CHECK="5"  # Number of recent epochs to check (default: 5)
```

### Running the Migration

#### Option 1: Let the script discover players automatically

The script will attempt to discover player addresses from contract events:

```bash
cd bunt
bun migrate-all.ts
```

#### Option 2: Provide specific player addresses

If you know which players need migration:

```bash
export PLAYER_ADDRESSES="GADDR1...,GADDR2...,GADDR3..."
bun migrate-all.ts
```

#### Option 3: Use a .env file

Create `bunt/.env`:

```env
ADMIN_SECRET="SXXX..."
BLENDIZZARD_ID="CXXX..."
PLAYER_ADDRESSES="GADDR1...,GADDR2..."
EPOCHS_TO_CHECK=5
```

Then run:

```bash
bun migrate-all.ts
```

### What the Script Does

1. **Discovers Players** (if not provided)
   - Queries contract events to find active player addresses
   - Or uses provided `PLAYER_ADDRESSES`

2. **Migrates Player Data** (Persistent)
   - For each player, calls `migrate_player(player_address)`
   - Converts V0/V1 data to V2 format
   - Moves data from old storage key to new key
   - Skips if already migrated

3. **Migrates EpochPlayer Data** (Temporary)
   - Checks recent epochs (default: last 5)
   - For each (epoch, player) pair, calls `migrate_epoch_player(epoch, player)`
   - Moves data from `DataKey::EpochUser` to `DataKey::EpochPlayer`
   - Skips if already migrated

4. **Reports Results**
   - Shows how many migrations succeeded
   - Shows how many were already migrated
   - Reports any errors

### Example Output

```
🔄 Blendizzard Migration Script
============================================================

📋 Configuration:
   Contract: CAK6Z6KFMB3V2ENEJ7THVKXUYQ5EG7EL2TM5UQ2FLDXI37FS6DRIMIZH
   RPC: https://rpc.lightsail.network
   Network: Public Global Stellar Network ; September 2015
   Epochs to check: 5
   Admin: GBXXXX...
   Current Epoch: 12

📝 Using 3 provided player addresses


📦 Step 1: Migrating Player Data (V0/V1 → V2)
------------------------------------------------------------
   Migrating player GADDR1... ✅
   Migrating player GADDR2... ✅
   Migrating player GADDR3... ✅

   Summary:
   ✅ Migrated: 3
   ⏭️  Skipped (already migrated): 0
   ❌ Errors: 0


📊 Step 2: Migrating EpochPlayer Data (DataKey rename)
------------------------------------------------------------
   Checking epochs: 12, 11, 10, 9, 8

   Epoch 12:
      ✅ Migrated: GADDR1...
      ✅ Migrated: GADDR2...
      ⏭️  No migrations needed (1 already migrated)

   Epoch 11:
      ⏭️  No migrations needed (3 already migrated)

============================================================
📊 Final Migration Summary
============================================================

   Total Players Processed: 3

   Player Data (Persistent):
      ✅ Migrated: 3
      ⏭️  Already Current: 0

   EpochPlayer Data (Temporary):
      ✅ Migrated: 2
      ⏭️  Already Current: 13

   ❌ Total Errors: 0

   ✨ Migration completed successfully!

============================================================
```

## Manual Migration (Alternative)

If you prefer to migrate specific players manually:

### Migrate a single player

```typescript
import { Client } from 'blendizzard';

const client = new Client({ /* config */ });

// Migrate player data
const wasMigrated = await client.migrate_player({
  player: 'GADDR...',
});

console.log(`Player migrated: ${wasMigrated}`);
```

### Migrate epoch-specific data

```typescript
// Migrate epoch player data
const wasEpochMigrated = await client.migrate_epoch_player({
  epoch: 12,
  player: 'GADDR...',
});

console.log(`Epoch player migrated: ${wasEpochMigrated}`);
```

## Verification

After migration, verify the data is accessible:

```typescript
// Query player data (should work without errors)
const player = await client.get_player({
  player: 'GADDR...',
});

console.log('Player data:', player);

// Query epoch player data
const epochPlayer = await client.get_epoch_player({
  player: 'GADDR...',
});

console.log('Epoch player data:', epochPlayer);
```

## Troubleshooting

### Error: "ADMIN_SECRET environment variable is required"

Set the admin keypair secret:
```bash
export ADMIN_SECRET="SXXX..."
```

### Error: "No player addresses found"

Provide player addresses explicitly:
```bash
export PLAYER_ADDRESSES="GADDR1...,GADDR2..."
```

### Error: "Could not get current epoch from contract"

Check that:
- Contract is deployed and initialized
- RPC URL is correct
- Network passphrase matches deployment network

### Players already migrated

If the script reports all players are "Already Current", that means:
- They've been successfully migrated before, OR
- They were created after the migration (already using new format)

This is normal and safe to ignore.

## Notes

- **Safe to run multiple times**: The migration functions return `false` if already migrated
- **No data loss**: Old data is deleted only after successful migration
- **Atomic**: Each migration is a separate transaction
- **Temporary data**: EpochPlayer data expires after ~30 days (TTL), so very old epochs may not need migration
