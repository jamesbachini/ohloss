/**
 * Migration Script for Blendizzard Contract
 *
 * Migrates player data from old formats to new:
 * - Player: V0/V1 → V2 (struct schema + DataKey::User → DataKey::Player)
 * - EpochPlayer: DataKey::EpochUser → DataKey::EpochPlayer
 *
 * Usage:
 *   bun migrate-all.ts
 *
 * Environment Variables:
 *   ADMIN_SECRET - Admin keypair secret (required)
 *   BLENDIZZARD_ID - Contract address (required)
 *   RPC_URL - Soroban RPC URL (default: https://rpc.lightsail.network)
 *   NETWORK_PASSPHRASE - Network (default: Public Global Stellar Network ; September 2015)
 *   PLAYER_ADDRESSES - Comma-separated list of player addresses to migrate (optional)
 *   EPOCHS_TO_CHECK - Number of recent epochs to check (default: 5)
 */

import { Client as BlendizzardContract } from 'blendizzard';
import { Keypair, Networks, Transaction, BASE_FEE, contract, rpc } from '@stellar/stellar-sdk';

// Re-export types
type AssembledTransaction<T> = contract.AssembledTransaction<T>;
type ClientOptions = contract.ClientOptions;
const Api = rpc.Api;

// ============================================================================
// Configuration
// ============================================================================

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const BLENDIZZARD_ID = process.env.BLENDIZZARD_ID || 'CAK6Z6KFMB3V2ENEJ7THVKXUYQ5EG7EL2TM5UQ2FLDXI37FS6DRIMIZH';
const RPC_URL = process.env.RPC_URL || 'https://rpc.lightsail.network';
const NETWORK_PASSPHRASE = process.env.NETWORK_PASSPHRASE || Networks.PUBLIC;
const EPOCHS_TO_CHECK = parseInt(process.env.EPOCHS_TO_CHECK || '5');

// Optional: Specific player addresses to migrate (comma-separated)
const PLAYER_ADDRESSES = process.env.PLAYER_ADDRESSES?.split(',').map(a => a.trim()).filter(Boolean);

const DEFAULT_METHOD_OPTIONS = {
  fee: Number(BASE_FEE) + 1,
  timeoutInSeconds: 30,
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

function createClient(keypair: Keypair): BlendizzardContract {
  const options: ClientOptions = {
    contractId: BLENDIZZARD_ID,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: keypair.publicKey(),
    async signTransaction(tx: string) {
      const transaction = new Transaction(tx, NETWORK_PASSPHRASE);
      transaction.sign(keypair);
      return { signedTxXdr: transaction.toXDR() };
    },
  };

  return new BlendizzardContract(options);
}

async function executeTx<T>(
  txPromise: Promise<AssembledTransaction<T>>,
  description: string,
  silent = false
): Promise<{ success: boolean; result?: T; error?: string }> {
  if (!silent) {
    process.stdout.write(`   ${description}... `);
  }

  try {
    const assembled = await txPromise;

    if (!assembled.simulation || !Api.isSimulationSuccess(assembled.simulation)) {
      // Extract detailed error information
      let errorDetails = 'Unknown simulation error';
      if (assembled.simulation && 'error' in assembled.simulation) {
        const simError = (assembled.simulation as any).error;
        errorDetails = simError;

        // Try to extract event log if available
        if (assembled.simulation && 'events' in assembled.simulation) {
          const events = (assembled.simulation as any).events;
          if (events && events.length > 0) {
            errorDetails += '\n      Events: ' + JSON.stringify(events, null, 2);
          }
        }
      }

      if (!silent) {
        console.log(`❌`);
        console.log(`      Simulation failed: ${errorDetails}`);
      }
      return { success: false, error: errorDetails };
    }

    const { result } = await assembled.signAndSend({ force: true });
    if (!silent) console.log(`✅`);
    return { success: true, result };
  } catch (error: any) {
    if (!silent) {
      console.log(`❌`);
      console.log(`      Error: ${error.message}`);
    }
    return { success: false, error: error.message };
  }
}

async function queryContract<T>(
  txPromise: Promise<AssembledTransaction<contract.Result<T>>>,
  silent = false
): Promise<T | null> {
  try {
    const assembled = await txPromise;

    if (!assembled.simulation) {
      if (!silent) console.error(`   Query failed: No simulation result`);
      return null;
    }

    if (!Api.isSimulationSuccess(assembled.simulation)) {
      if (!silent) {
        console.error(`   Query simulation failed`);
      }
      return null;
    }

    return assembled.result.unwrap();
  } catch (error: any) {
    if (!silent) {
      console.error(`   Query failed: ${error.message}`);
    }
    return null;
  }
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Get current epoch number
 */
async function getCurrentEpoch(client: BlendizzardContract): Promise<number | null> {
  try {
    // Query epoch 0 (first epoch) as a safe default
    // The contract should always have at least epoch 0
    const epochInfo = await queryContract(
      client.get_epoch({ epoch: 0 } as any, DEFAULT_METHOD_OPTIONS),
      false
    );

    if (!epochInfo) {
      console.error('   Failed to query epoch - simulation failed or returned null');
      return null;
    }

    // The field is called epoch_number, not epoch
    const currentEpochNum = (epochInfo as any)?.epoch_number;

    // Convert to number if it's a BigInt or string
    let epochNumber: number;
    if (typeof currentEpochNum === 'bigint') {
      epochNumber = Number(currentEpochNum);
    } else if (typeof currentEpochNum === 'number') {
      epochNumber = currentEpochNum;
    } else if (typeof currentEpochNum === 'string') {
      epochNumber = parseInt(currentEpochNum, 10);
    } else {
      console.error('   Epoch query succeeded but epoch_number has invalid type:', typeof currentEpochNum);
      return null;
    }

    return epochNumber;
  } catch (error: any) {
    console.error(`   Failed to get current epoch: ${error.message}`);
    return null;
  }
}

/**
 * Discover player addresses by querying contract events
 * This looks for FactionSelected and GameStarted events to find active players
 */
async function discoverPlayers(client: BlendizzardContract): Promise<string[]> {
  console.log('\n🔍 Discovering player addresses from contract events...');

  try {
    // Get recent contract events (soroban-sdk events)
    const server = new rpc.Server(RPC_URL);

    // Query events for the contract
    const events = await server.getEvents({
      filters: [
        {
          type: 'contract' as const,
          contractIds: [BLENDIZZARD_ID],
        },
      ],
    } as any);

    const playerSet = new Set<string>();

    // Extract player addresses from events
    // Events like FactionSelected, GameStarted, etc. will have player addresses
    for (const event of events.events) {
      const value = event.value;

      // Try to extract address-like values from the event
      // This is a heuristic approach - adjust based on actual event structure
      const addressRegex = /G[A-Z0-9]{55}/g;
      const eventJson = JSON.stringify(value);
      const matches = eventJson.match(addressRegex);

      if (matches) {
        matches.forEach(addr => playerSet.add(addr));
      }
    }

    const players = Array.from(playerSet);
    console.log(`   Found ${players.length} unique player addresses`);
    return players;
  } catch (error: any) {
    console.error(`   ⚠️  Could not discover players from events: ${error.message}`);
    console.log(`   Using provided PLAYER_ADDRESSES instead`);
    return [];
  }
}

// ============================================================================
// Main Migration Logic
// ============================================================================

async function main() {
  console.log('🔄 Blendizzard Migration Script');
  console.log('='.repeat(60));

  // Validate configuration
  if (!ADMIN_SECRET) {
    console.error('\n❌ ERROR: ADMIN_SECRET environment variable is required');
    console.error('   Set it to the admin keypair secret key');
    process.exit(1);
  }

  if (!BLENDIZZARD_ID) {
    console.error('\n❌ ERROR: BLENDIZZARD_ID environment variable is required');
    process.exit(1);
  }

  console.log(`\n📋 Configuration:`);
  console.log(`   Contract: ${BLENDIZZARD_ID}`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Network: ${NETWORK_PASSPHRASE}`);
  console.log(`   Epochs to check: ${EPOCHS_TO_CHECK}`);

  // Initialize admin client
  const admin = Keypair.fromSecret(ADMIN_SECRET);
  const client = createClient(admin);
  console.log(`   Admin: ${admin.publicKey()}`);

  // Get current epoch
  const currentEpoch = await getCurrentEpoch(client);
  if (currentEpoch === null) {
    console.error('\n❌ ERROR: Could not get current epoch from contract');
    process.exit(1);
  }
  console.log(`   Current Epoch: ${currentEpoch}`);

  // Determine player list
  let playerAddresses: string[] = [];

  if (PLAYER_ADDRESSES && PLAYER_ADDRESSES.length > 0) {
    playerAddresses = PLAYER_ADDRESSES;
    console.log(`\n📝 Using ${playerAddresses.length} provided player addresses`);
  } else {
    const discovered = await discoverPlayers(client);
    if (discovered.length > 0) {
      playerAddresses = discovered;
    } else {
      console.error('\n❌ ERROR: No player addresses found.');
      console.error('   Please provide PLAYER_ADDRESSES environment variable');
      console.error('   Example: PLAYER_ADDRESSES="GADDR1...,GADDR2..."');
      process.exit(1);
    }
  }

  // Migration statistics
  const stats = {
    totalPlayers: playerAddresses.length,
    playersMigrated: 0,
    playersSkipped: 0,
    epochPlayersMigrated: 0,
    epochPlayersSkipped: 0,
    errors: 0,
  };

  // ============================================================================
  // Step 1: Migrate Player Data (persistent)
  // ============================================================================

  console.log('\n\n📦 Step 1: Migrating Player Data (V0/V1 → V2)');
  console.log('-'.repeat(60));

  for (const playerAddress of playerAddresses) {
    try {
      const result = await executeTx(
        client.migrate_player({ player: playerAddress }, DEFAULT_METHOD_OPTIONS),
        `Migrating player ${playerAddress.slice(0, 8)}...`
      );

      if (result.success && result.result === true) {
        stats.playersMigrated++;
      } else if (result.success && result.result === false) {
        // Migration returned false = already migrated
        stats.playersSkipped++;
      } else {
        // Simulation failed or other error
        stats.errors++;
        console.error(`   ❌ Failed for ${playerAddress.slice(0, 8)}: ${result.error}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Error migrating ${playerAddress.slice(0, 8)}: ${error.message}`);
      stats.errors++;
    }
  }

  console.log(`\n   Summary:`);
  console.log(`   ✅ Migrated: ${stats.playersMigrated}`);
  console.log(`   ⏭️  Skipped (already migrated): ${stats.playersSkipped}`);
  console.log(`   ❌ Errors: ${stats.errors}`);

  // ============================================================================
  // Step 2: Migrate EpochPlayer Data (temporary)
  // ============================================================================

  console.log('\n\n📊 Step 2: Migrating EpochPlayer Data (DataKey rename)');
  console.log('-'.repeat(60));

  // Determine which epochs to check
  const epochsToCheck: number[] = [];
  for (let i = 0; i < EPOCHS_TO_CHECK; i++) {
    const epoch = currentEpoch - i;
    if (epoch >= 0) {
      epochsToCheck.push(epoch);
    }
  }

  console.log(`   Checking epochs: ${epochsToCheck.join(', ')}`);
  console.log('');

  for (const epoch of epochsToCheck) {
    console.log(`\n   Epoch ${epoch}:`);
    let epochMigrated = 0;
    let epochSkipped = 0;

    for (const playerAddress of playerAddresses) {
      try {
        const result = await executeTx(
          client.migrate_epoch_player({ epoch, player: playerAddress }, DEFAULT_METHOD_OPTIONS),
          `Migrating epoch ${epoch} for player ${playerAddress.slice(0, 8)}...`,
          true // silent
        );

        if (result.success && result.result === true) {
          console.log(`      ✅ Migrated: ${playerAddress.slice(0, 8)}...`);
          epochMigrated++;
          stats.epochPlayersMigrated++;
        } else if (result.success && result.result === false) {
          // Migration returned false = already migrated
          epochSkipped++;
          stats.epochPlayersSkipped++;
        } else {
          // Simulation failed or other error
          console.error(`      ❌ Failed: ${playerAddress.slice(0, 8)}... - ${result.error}`);
          stats.errors++;
        }
      } catch (error: any) {
        console.error(`      ❌ Error: ${playerAddress.slice(0, 8)}... - ${error.message}`);
        stats.errors++;
      }
    }

    if (epochMigrated === 0) {
      console.log(`      ⏭️  No migrations needed (${epochSkipped} already migrated)`);
    }
  }

  // ============================================================================
  // Final Summary
  // ============================================================================

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 Final Migration Summary');
  console.log('='.repeat(60));
  console.log(`\n   Total Players Processed: ${stats.totalPlayers}`);
  console.log(`\n   Player Data (Persistent):`);
  console.log(`      ✅ Migrated: ${stats.playersMigrated}`);
  console.log(`      ⏭️  Already Current: ${stats.playersSkipped}`);
  console.log(`\n   EpochPlayer Data (Temporary):`);
  console.log(`      ✅ Migrated: ${stats.epochPlayersMigrated}`);
  console.log(`      ⏭️  Already Current: ${stats.epochPlayersSkipped}`);
  console.log(`\n   ❌ Total Errors: ${stats.errors}`);

  if (stats.errors > 0) {
    console.log('\n   ⚠️  Some migrations failed. Review the errors above.');
    process.exit(1);
  } else if (stats.playersMigrated === 0 && stats.epochPlayersMigrated === 0) {
    console.log('\n   ✨ All data already migrated! Nothing to do.');
  } else {
    console.log('\n   ✨ Migration completed successfully!');
  }

  console.log('\n' + '='.repeat(60));
}

// Run the script
main().catch((error) => {
  console.error('\n\n💥 Fatal Error:', error);
  process.exit(1);
});
