/**
 * Test script to understand how to properly reconstruct a signed auth entry
 *
 * This simulates the flow:
 * 1. Get a stubbed auth entry from simulation
 * 2. Extract it and get a mock signature from "wallet"
 * 3. Reconstruct the auth entry with the signature
 * 4. Serialize it to XDR
 */

import { contract, xdr, Address, Keypair } from '@stellar/stellar-sdk';
import { Client as NumberGuessClient } from 'number-guess';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const GAME_CONTRACT = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

async function testAuthEntryReconstruction() {
  console.log('=== Testing Auth Entry Reconstruction ===\n');

  // Create test keypairs
  const player1 = Keypair.random();
  const player2 = Keypair.random();

  console.log('Player 1:', player1.publicKey());
  console.log('Player 2:', player2.publicKey());
  console.log();

  // Step 1: Build and simulate a transaction to get stubbed auth entry
  console.log('Step 1: Building transaction with Player 2 as source...');
  const buildClient = new NumberGuessClient({
    contractId: GAME_CONTRACT,
    networkPassphrase: NETWORK_PASSPHRASE,
    rpcUrl: RPC_URL,
    publicKey: player2.publicKey(),
  });

  const sessionId = Math.floor(Date.now() / 1000) % 1000000000;
  const player1Wager = BigInt(1_0000000); // 1.0 FP
  const player2Wager = BigInt(1_0000000);

  try {
    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1: player1.publicKey(),
      player2: player2.publicKey(),
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    });

    console.log('Transaction built and simulated');
    console.log('Has simulation data:', !!tx.simulationData);
    console.log('Has result:', !!tx.simulationData?.result);
    console.log('Has auth entries:', !!tx.simulationData?.result?.auth);
    console.log();

    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries in simulation');
    }

    const authEntries = tx.simulationData.result.auth;
    console.log(`Found ${authEntries.length} auth entries`);
    console.log();

    // Step 2: Find Player 1's auth entry
    console.log('Step 2: Finding Player 1 auth entry...');
    let player1AuthEntry = null;

    for (let i = 0; i < authEntries.length; i++) {
      const entry = authEntries[i];
      try {
        const entryAddress = entry.credentials().address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();

        console.log(`Auth entry ${i} address:`, entryAddressString);

        if (entryAddressString === player1.publicKey()) {
          player1AuthEntry = entry;
          console.log(`Found Player 1 auth entry at index ${i}`);
          break;
        }
      } catch (err) {
        console.log(`Auth entry ${i} error:`, err);
      }
    }
    console.log();

    if (!player1AuthEntry) {
      throw new Error('Player 1 auth entry not found');
    }

    // Step 3: Examine the stubbed auth entry structure
    console.log('Step 3: Examining stubbed auth entry structure...');
    const credentials = player1AuthEntry.credentials();
    const addressCreds = credentials.address();

    console.log('Address:', Address.fromScAddress(addressCreds.address()).toString());
    console.log('Nonce:', addressCreds.nonce().toString());
    console.log('Signature Expiration Ledger:', addressCreds.signatureExpirationLedger());
    console.log('Signature type:', addressCreds.signature().switch());
    console.log('Signature XDR:', addressCreds.signature().toXDR('base64'));
    console.log();

    // Step 4: Mock signing (simulate what wallet returns)
    console.log('Step 4: Mock signing with Player 1 keypair...');

    // In real flow, wallet returns just the signature bytes
    // Let's create a mock 64-byte signature
    const mockSignatureBytes = Buffer.alloc(64);
    crypto.getRandomValues(mockSignatureBytes);
    console.log('Mock signature (base64):', mockSignatureBytes.toString('base64'));
    console.log();

    // Step 5: Try to reconstruct the auth entry with signature
    console.log('Step 5: Reconstructing auth entry with signature...');

    // Try different approaches to see which one works

    // Approach 1: Using scvBytes for signature
    console.log('\nApproach 1: Using xdr.ScVal.scvBytes()');
    try {
      const signatureSCVal = xdr.ScVal.scvBytes(mockSignatureBytes);
      console.log('Signature SCVal type:', signatureSCVal.switch());

      const newCredentials = new xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: addressCreds.address(),
          nonce: addressCreds.nonce(),
          signatureExpirationLedger: 1000000,
          signature: signatureSCVal,
        })
      );

      const signedAuthEntry = new xdr.SorobanAuthorizationEntry({
        credentials: newCredentials,
        rootInvocation: player1AuthEntry.rootInvocation(),
      });

      const signedXdr = signedAuthEntry.toXDR('base64');
      console.log('✅ Success! Signed auth entry XDR length:', signedXdr.length);
      console.log('Signed auth entry XDR:', signedXdr.substring(0, 100) + '...');
    } catch (err: any) {
      console.log('❌ Failed:', err.message);
    }

    // Approach 2: Keep void signature (just to test serialization)
    console.log('\nApproach 2: Keeping void signature (baseline test)');
    try {
      const newCredentials = new xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: addressCreds.address(),
          nonce: addressCreds.nonce(),
          signatureExpirationLedger: 1000000,
          signature: addressCreds.signature(), // Keep original void
        })
      );

      const signedAuthEntry = new xdr.SorobanAuthorizationEntry({
        credentials: newCredentials,
        rootInvocation: player1AuthEntry.rootInvocation(),
      });

      const signedXdr = signedAuthEntry.toXDR('base64');
      console.log('✅ Success! Auth entry with void signature XDR length:', signedXdr.length);
    } catch (err: any) {
      console.log('❌ Failed:', err.message);
    }

    // Approach 3: Log the full structure to understand what's breaking
    console.log('\nApproach 3: Detailed structure inspection');
    console.log('Address type:', typeof addressCreds.address());
    console.log('Nonce type:', typeof addressCreds.nonce());
    console.log('Nonce value:', addressCreds.nonce());
    console.log('SignatureExpirationLedger type:', typeof addressCreds.signatureExpirationLedger());

  } catch (err: any) {
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

// Run the test
testAuthEntryReconstruction().catch(console.error);
