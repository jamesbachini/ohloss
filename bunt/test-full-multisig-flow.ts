/**
 * Test the full multi-sig flow:
 * 1. Player 1 prepares and exports signed auth entry
 * 2. Player 2 imports the signed auth entry and rebuilds transaction
 * 3. Both players' auth entries are signed
 * 4. Transaction is submitted
 */

import { xdr, Address, authorizeEntry, Keypair } from '@stellar/stellar-sdk';
import { Client as NumberGuessClient } from 'number-guess';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const GAME_CONTRACT = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

// Use test accounts
const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';

async function testFullMultiSigFlow() {
  console.log('=== Testing Full Multi-Sig Flow ===\n');

  const sessionId = Math.floor(Date.now() / 1000) % 1000000000;
  const player1Wager = BigInt(1_0000000);
  const player2Wager = BigInt(1_0000000);

  console.log('Session ID:', sessionId);
  console.log('Player 1:', PLAYER1);
  console.log('Player 2:', PLAYER2);
  console.log('Player 1 Wager:', player1Wager.toString());
  console.log('Player 2 Wager:', player2Wager.toString());
  console.log();

  try {
    // ============================================
    // STEP 1: Player 1 builds and exports
    // ============================================
    console.log('📤 STEP 1: Player 1 prepares and exports auth entry');
    console.log('================================================\n');

    const player1Client = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLAYER1,
    });

    console.log('Building transaction with Player 1 as source...');
    const player1Tx = await player1Client.start_game({
      session_id: sessionId,
      player1: PLAYER1,
      player2: PLAYER2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    });

    console.log('✅ Transaction built and simulated');
    console.log('Has simulation data:', !!player1Tx.simulationData);
    console.log('Has result:', !!player1Tx.simulationData?.result);
    console.log('Has auth entries:', !!player1Tx.simulationData?.result?.auth);
    console.log();

    // Check simulation data
    if (!player1Tx.simulationData?.result?.auth) {
      throw new Error('No auth entries in simulation');
    }

    const simAuthEntries = player1Tx.simulationData.result.auth;
    console.log(`Found ${simAuthEntries.length} auth entries in simulation data`);

    // Find Player 1's auth entry
    let player1AuthEntry = null;
    for (let i = 0; i < simAuthEntries.length; i++) {
      const entry = simAuthEntries[i];
      try {
        const entryAddress = entry.credentials().address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();
        console.log(`Auth entry ${i}: ${entryAddressString}`);

        if (entryAddressString === PLAYER1) {
          player1AuthEntry = entry;
          console.log(`✅ Found Player 1 auth entry at index ${i}`);
        }
      } catch (err: any) {
        console.log(`Auth entry ${i} error:`, err.message);
      }
    }
    console.log();

    if (!player1AuthEntry) {
      throw new Error('Player 1 auth entry not found');
    }

    // Check if there are auth entries in the operation
    console.log('Checking operation auth entries...');
    const operation = player1Tx.built?.operations[0];
    if (operation && operation.type === 'invokeHostFunction') {
      const opAuthEntries = operation.auth || [];
      console.log(`Operation has ${opAuthEntries.length} auth entries`);

      if (opAuthEntries.length > 0) {
        for (let i = 0; i < opAuthEntries.length; i++) {
          try {
            const entryAddress = opAuthEntries[i].credentials().address().address();
            const entryAddressString = Address.fromScAddress(entryAddress).toString();
            console.log(`Operation auth entry ${i}: ${entryAddressString}`);
          } catch (err: any) {
            console.log(`Operation auth entry ${i} error:`, err.message);
          }
        }
      }
    }
    console.log();

    // Export Player 1's signed auth entry (simulated with mock signature)
    console.log('Exporting Player 1 signed auth entry (with mock signature)...');
    const player1SignedAuthEntryXdr = player1AuthEntry.toXDR('base64');
    console.log('Player 1 signed auth entry XDR length:', player1SignedAuthEntryXdr.length);
    console.log();

    // ============================================
    // STEP 2: Player 2 imports and rebuilds
    // ============================================
    console.log('📥 STEP 2: Player 2 imports and rebuilds transaction');
    console.log('==================================================\n');

    // Parse Player 1's auth entry
    console.log('Parsing Player 1 auth entry...');
    const parsedAuthEntry = xdr.SorobanAuthorizationEntry.fromXDR(player1SignedAuthEntryXdr, 'base64');
    const parsedCreds = parsedAuthEntry.credentials().address();
    const parsedPlayer1 = Address.fromScAddress(parsedCreds.address()).toString();

    const rootInvocation = parsedAuthEntry.rootInvocation();
    const contractFn = rootInvocation.function().contractFn();
    const args = contractFn.args();
    const parsedSessionId = args[0].u32();
    const parsedPlayer1Wager = args[1].i128().lo().toBigInt();

    console.log('Extracted from auth entry:');
    console.log('  Session ID:', parsedSessionId);
    console.log('  Player 1:', parsedPlayer1);
    console.log('  Player 1 Wager:', parsedPlayer1Wager.toString());
    console.log();

    // Player 2 builds new transaction
    console.log('Building transaction with Player 2 as source...');
    const player2Client = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLAYER2,
    });

    const player2Tx = await player2Client.start_game({
      session_id: parsedSessionId,
      player1: parsedPlayer1,
      player2: PLAYER2,
      player1_wager: parsedPlayer1Wager,
      player2_wager: player2Wager,
    });

    console.log('✅ Transaction built and simulated');
    console.log();

    // Check where auth entries are
    console.log('Checking where auth entries are located...');
    console.log('In simulation data:', !!player2Tx.simulationData?.result?.auth);
    if (player2Tx.simulationData?.result?.auth) {
      console.log('  Count:', player2Tx.simulationData.result.auth.length);
    }

    const player2Op = player2Tx.built?.operations[0];
    if (player2Op && player2Op.type === 'invokeHostFunction') {
      console.log('In operation.auth:', !!player2Op.auth);
      if (player2Op.auth) {
        console.log('  Count:', player2Op.auth.length);
      }
    }
    console.log();

    // Try to inject Player 1's signed auth entry
    console.log('Attempting to inject Player 1 signed auth entry...');
    console.log('Looking for Player 1 stubbed auth entry to replace...');

    // Check simulation data
    if (player2Tx.simulationData?.result?.auth) {
      const authEntries = player2Tx.simulationData.result.auth;
      console.log(`Checking ${authEntries.length} auth entries in simulation data:`);
      for (let i = 0; i < authEntries.length; i++) {
        try {
          const entryAddress = authEntries[i].credentials().address().address();
          const entryAddressString = Address.fromScAddress(entryAddress).toString();
          const signatureType = authEntries[i].credentials().address().signature().switch().name;
          console.log(`  [${i}] ${entryAddressString} - signature: ${signatureType}`);
        } catch (err: any) {
          console.log(`  [${i}] Error:`, err.message);
        }
      }
    }
    console.log();

    // Check operation auth
    if (player2Op && player2Op.type === 'invokeHostFunction' && player2Op.auth) {
      const authEntries = player2Op.auth;
      console.log(`Checking ${authEntries.length} auth entries in operation.auth:`);
      for (let i = 0; i < authEntries.length; i++) {
        try {
          const entryAddress = authEntries[i].credentials().address().address();
          const entryAddressString = Address.fromScAddress(entryAddress).toString();
          const signatureType = authEntries[i].credentials().address().signature().switch().name;
          console.log(`  [${i}] ${entryAddressString} - signature: ${signatureType}`);
        } catch (err: any) {
          console.log(`  [${i}] Error:`, err.message);
        }
      }
    }
    console.log();

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) {
      console.error('Stack:', err.stack);
    }
  }
}

testFullMultiSigFlow().catch(console.error);
