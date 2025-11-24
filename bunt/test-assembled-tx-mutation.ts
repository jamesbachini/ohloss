/**
 * Test how to properly mutate AssembledTransaction
 * Figure out the correct way to inject signed auth entries
 */

import { xdr, Address } from '@stellar/stellar-sdk';
import { Client as NumberGuessClient } from 'number-guess';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const GAME_CONTRACT = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';

async function testAssembledTxMutation() {
  console.log('=== Testing AssembledTransaction Mutation ===\n');

  const sessionId = Math.floor(Date.now() / 1000) % 1000000000;
  const player1Wager = BigInt(1_0000000);
  const player2Wager = BigInt(1_0000000);

  try {
    // Step 1: Build transaction with Player 2 as source
    console.log('Step 1: Building transaction with Player 2...');
    const client = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLAYER2,
    });

    const tx = await client.start_game({
      session_id: sessionId,
      player1: PLAYER1,
      player2: PLAYER2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    });

    console.log('✅ Transaction built and simulated\n');

    // Step 2: Inspect the AssembledTransaction structure
    console.log('Step 2: Inspecting AssembledTransaction structure...');
    console.log('Type:', tx.constructor.name);
    console.log('Has simulationData:', !!tx.simulationData);
    console.log('Has built:', !!tx.built);
    console.log();

    // Step 3: Check where auth entries are
    console.log('Step 3: Locating auth entries...');

    if (tx.simulationData?.result?.auth) {
      const simAuthEntries = tx.simulationData.result.auth;
      console.log(`Found ${simAuthEntries.length} auth entries in simulationData.result.auth:`);
      for (let i = 0; i < simAuthEntries.length; i++) {
        try {
          const creds = simAuthEntries[i].credentials();
          const credType = creds.switch().name;

          if (credType === 'sorobanCredentialsAddress') {
            const addr = Address.fromScAddress(creds.address().address()).toString();
            const sigType = creds.address().signature().switch().name;
            console.log(`  [${i}] ${addr} - ${sigType}`);
          } else {
            console.log(`  [${i}] ${credType}`);
          }
        } catch (err: any) {
          console.log(`  [${i}] Error:`, err.message);
        }
      }
    }
    console.log();

    const operation = tx.built?.operations[0];
    if (operation && operation.type === 'invokeHostFunction') {
      const opAuthEntries = operation.auth || [];
      console.log(`Found ${opAuthEntries.length} auth entries in operation.auth`);
      if (opAuthEntries.length > 0) {
        for (let i = 0; i < opAuthEntries.length; i++) {
          try {
            const creds = opAuthEntries[i].credentials();
            const credType = creds.switch().name;

            if (credType === 'sorobanCredentialsAddress') {
              const addr = Address.fromScAddress(creds.address().address()).toString();
              const sigType = creds.address().signature().switch().name;
              console.log(`  [${i}] ${addr} - ${sigType}`);
            } else {
              console.log(`  [${i}] ${credType}`);
            }
          } catch (err: any) {
            console.log(`  [${i}] Error:`, err.message);
          }
        }
      }
    }
    console.log();

    // Step 4: Try different mutation approaches
    console.log('Step 4: Testing mutation approaches...\n');

    // Approach 1: Direct assignment to simulationData
    console.log('Approach 1: Direct assignment to simulationData...');
    try {
      tx.simulationData = {
        ...tx.simulationData,
        result: {
          ...tx.simulationData.result,
          auth: [...tx.simulationData.result.auth],
        },
      };
      console.log('✅ Direct assignment works!');
    } catch (err: any) {
      console.log('❌ Direct assignment failed:', err.message);
    }
    console.log();

    // Approach 2: Check if simulationData has a setter
    console.log('Approach 2: Check property descriptor...');
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tx), 'simulationData');
    if (descriptor) {
      console.log('Property descriptor exists:');
      console.log('  Has getter:', !!descriptor.get);
      console.log('  Has setter:', !!descriptor.set);
      console.log('  Configurable:', descriptor.configurable);
      console.log('  Enumerable:', descriptor.enumerable);
    } else {
      console.log('No property descriptor found (might be own property)');
    }
    console.log();

    // Approach 3: Check if we can mutate the auth array directly
    console.log('Approach 3: Try mutating auth array directly...');
    try {
      if (tx.simulationData?.result?.auth) {
        const originalLength = tx.simulationData.result.auth.length;
        tx.simulationData.result.auth.push(tx.simulationData.result.auth[0]);
        const newLength = tx.simulationData.result.auth.length;
        console.log(`Original length: ${originalLength}, New length: ${newLength}`);
        if (newLength > originalLength) {
          console.log('✅ Direct array mutation works!');
          // Clean up
          tx.simulationData.result.auth.pop();
        } else {
          console.log('❌ Array mutation had no effect');
        }
      }
    } catch (err: any) {
      console.log('❌ Array mutation failed:', err.message);
    }
    console.log();

    // Approach 4: Check what methods are available
    console.log('Approach 4: Available methods on AssembledTransaction...');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(tx))
      .filter(name => typeof tx[name as keyof typeof tx] === 'function');
    console.log('Methods:', methods.join(', '));
    console.log();

  } catch (err: any) {
    console.error('❌ Error:', err.message);
    if (err.stack) {
      console.error('Stack:', err.stack);
    }
  }
}

testAssembledTxMutation().catch(console.error);
