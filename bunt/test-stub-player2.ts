/**
 * Test if we can use stub/random values for Player 2 when Player 1 is creating & exporting
 * Since we only need Player 1's signed auth entry, Player 2 details don't matter
 */

import { Keypair } from '@stellar/stellar-sdk';
import { Client as NumberGuessClient } from 'number-guess';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const GAME_CONTRACT = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

// Real Player 1 address (the one creating & exporting)
const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';

// Known Player 2 address for comparison (from previous tests)
const PLAYER2_KNOWN = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';

async function testStubPlayer2() {
  console.log('=== Testing Stub Player 2 Values ===\n');

  const sessionId = Math.floor(Date.now() / 1000) % 1000000000;
  const player1Wager = BigInt(1_0000000); // 0.1 USDC

  // Try different Player 2 stub values
  const stubAddresses = [
    { name: 'Known Player 2', address: PLAYER2_KNOWN }, // Try known address first
    { name: 'Zero Account', address: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF' },
    { name: 'Random Keypair', address: Keypair.random().publicKey() },
    { name: 'All B Account', address: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' },
  ];

  for (const stub of stubAddresses) {
    console.log(`\nTesting with ${stub.name}: ${stub.address}`);
    console.log('='.repeat(80));

    try {
      const client = new NumberGuessClient({
        contractId: GAME_CONTRACT,
        networkPassphrase: NETWORK_PASSPHRASE,
        rpcUrl: RPC_URL,
        publicKey: PLAYER1,
      });

      console.log('Building transaction...');
      const tx = await client.start_game({
        session_id: sessionId,
        player1: PLAYER1,
        player2: stub.address, // Stub Player 2 address
        player1_wager: player1Wager,
        player2_wager: BigInt(1_0000000), // Stub Player 2 wager (same amount)
      });

      console.log('✅ Transaction built and simulated successfully!');
      console.log('Has simulation data:', !!tx.simulationData);
      console.log('Has auth entries:', !!tx.simulationData?.result?.auth);

      if (tx.simulationData?.result?.auth) {
        const authEntries = tx.simulationData.result.auth;
        console.log(`Found ${authEntries.length} auth entries:`);

        for (let i = 0; i < authEntries.length; i++) {
          try {
            const creds = authEntries[i].credentials();
            const credType = creds.switch().name;

            if (credType === 'sorobanCredentialsAddress') {
              const addr = creds.address().address();
              const addrString = addr.toAddress ? addr.toAddress() : 'Unknown';
              console.log(`  [${i}] Address: ${addrString.substring(0, 10)}...`);
            } else {
              console.log(`  [${i}] ${credType}`);
            }
          } catch (err: any) {
            console.log(`  [${i}] Error:`, err.message);
          }
        }
      }

      console.log(`\n✅ SUCCESS with ${stub.name}!`);
      console.log('Player 1 can export their auth entry regardless of Player 2 address.');

      // This stub address works, no need to test others
      return;

    } catch (err: any) {
      console.log(`❌ FAILED with ${stub.name}`);
      console.log('Error:', err.message);

      // Check if it's a simulation error
      if (err.message.includes('simulation')) {
        console.log('Simulation failed - this stub address does not work');
      }
    }
  }

  console.log('\n❌ All stub addresses failed. May need to use a real Player 2 address for simulation.');
}

testStubPlayer2().catch(console.error);
