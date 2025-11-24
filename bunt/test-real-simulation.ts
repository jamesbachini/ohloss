/**
 * Test with REAL RPC simulation to see if auth entries from simulation behave differently
 */

import { xdr, Address } from '@stellar/stellar-sdk';
import { Client as NumberGuessClient } from 'number-guess';

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const RPC_URL = 'https://soroban-testnet.stellar.org';
const GAME_CONTRACT = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

// Use actual test accounts from your frontend
const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';

async function testWithRealSimulation() {
  console.log('=== Testing with REAL RPC Simulation ===\n');

  console.log('Player 1:', PLAYER1);
  console.log('Player 2:', PLAYER2);
  console.log();

  try {
    // Build and simulate
    console.log('Step 1: Building and simulating transaction...');
    const buildClient = new NumberGuessClient({
      contractId: GAME_CONTRACT,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: RPC_URL,
      publicKey: PLAYER2, // Player 2 is source
    });

    const sessionId = Math.floor(Date.now() / 1000) % 1000000000;
    const player1Wager = BigInt(1_0000000);
    const player2Wager = BigInt(1_0000000);

    const tx = await buildClient.start_game({
      session_id: sessionId,
      player1: PLAYER1,
      player2: PLAYER2,
      player1_wager: player1Wager,
      player2_wager: player2Wager,
    });

    console.log('✅ Transaction simulated');
    console.log();

    if (!tx.simulationData?.result?.auth) {
      throw new Error('No auth entries in simulation');
    }

    const authEntries = tx.simulationData.result.auth;
    console.log(`Found ${authEntries.length} auth entries`);
    console.log();

    // Find Player 1's auth entry
    console.log('Step 2: Finding Player 1 auth entry...');
    let player1AuthEntry = null;

    for (let i = 0; i < authEntries.length; i++) {
      const entry = authEntries[i];
      try {
        const entryAddress = entry.credentials().address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();

        console.log(`Auth entry ${i} address:`, entryAddressString);

        if (entryAddressString === PLAYER1) {
          player1AuthEntry = entry;
          console.log(`✅ Found Player 1 auth entry at index ${i}`);
          break;
        }
      } catch (err: any) {
        console.log(`Auth entry ${i} error:`, err.message);
      }
    }
    console.log();

    if (!player1AuthEntry) {
      throw new Error('Player 1 auth entry not found');
    }

    // Examine the REAL auth entry from simulation
    console.log('Step 3: Examining REAL auth entry from RPC simulation...');
    const originalCreds = player1AuthEntry.credentials().address();

    console.log('Address:', Address.fromScAddress(originalCreds.address()).toString());
    console.log('Nonce type:', typeof originalCreds.nonce());
    console.log('Nonce value:', originalCreds.nonce());
    console.log('Nonce _value:', (originalCreds.nonce() as any)._value);
    console.log('Nonce toString:', originalCreds.nonce().toString());
    console.log('Signature type:', originalCreds.signature().switch());
    console.log();

    // Try to reconstruct
    console.log('Step 4: Attempting reconstruction with reused objects...');
    const mockSignatureBytes = Buffer.alloc(64);
    crypto.getRandomValues(mockSignatureBytes);
    const signatureSCVal = xdr.ScVal.scvBytes(mockSignatureBytes);
    const validUntilLedger = 60000000;

    try {
      const newAddressCredentials = new xdr.SorobanAddressCredentials({
        address: originalCreds.address(),
        nonce: originalCreds.nonce(),
        signatureExpirationLedger: validUntilLedger,
        signature: signatureSCVal,
      });

      const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);

      const signedAuthEntry = new xdr.SorobanAuthorizationEntry({
        credentials: newCredentials,
        rootInvocation: player1AuthEntry.rootInvocation(),
      });

      const signedXdr = signedAuthEntry.toXDR('base64');
      console.log('✅ SUCCESS! Signed auth entry XDR (length:', signedXdr.length, ')');
      console.log();
    } catch (err: any) {
      console.log('❌ FAILED:', err.message);
      console.log('Error:', err);
      console.log();
    }

    // Try with fresh nonce
    console.log('Step 5: Attempting reconstruction with fresh nonce...');
    try {
      const freshNonce = xdr.Int64.fromString(originalCreds.nonce().toString());
      console.log('Fresh nonce type:', typeof freshNonce);
      console.log('Fresh nonce value:', freshNonce);

      const newAddressCredentials = new xdr.SorobanAddressCredentials({
        address: originalCreds.address(),
        nonce: freshNonce, // Fresh nonce from string
        signatureExpirationLedger: validUntilLedger,
        signature: signatureSCVal,
      });

      const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);

      const signedAuthEntry = new xdr.SorobanAuthorizationEntry({
        credentials: newCredentials,
        rootInvocation: player1AuthEntry.rootInvocation(),
      });

      const signedXdr = signedAuthEntry.toXDR('base64');
      console.log('✅ SUCCESS with fresh nonce! Signed auth entry XDR (length:', signedXdr.length, ')');
      console.log();
    } catch (err: any) {
      console.log('❌ FAILED:', err.message);
      console.log();
    }

    // Try parsing the stubbed entry to XDR first
    console.log('Step 6: Parse stubbed entry to/from XDR, then reconstruct...');
    try {
      const stubbedXdr = player1AuthEntry.toXDR('base64');
      console.log('Stubbed entry XDR length:', stubbedXdr.length);

      const parsedEntry = xdr.SorobanAuthorizationEntry.fromXDR(stubbedXdr, 'base64');
      const parsedCreds = parsedEntry.credentials().address();

      console.log('Parsed nonce type:', typeof parsedCreds.nonce());
      console.log('Parsed nonce value:', parsedCreds.nonce());

      const newAddressCredentials = new xdr.SorobanAddressCredentials({
        address: parsedCreds.address(),
        nonce: parsedCreds.nonce(),
        signatureExpirationLedger: validUntilLedger,
        signature: signatureSCVal,
      });

      const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);

      const signedAuthEntry = new xdr.SorobanAuthorizationEntry({
        credentials: newCredentials,
        rootInvocation: parsedEntry.rootInvocation(),
      });

      const signedXdr = signedAuthEntry.toXDR('base64');
      console.log('✅ SUCCESS after XDR round-trip! Signed auth entry XDR (length:', signedXdr.length, ')');
      console.log();
    } catch (err: any) {
      console.log('❌ FAILED:', err.message);
      console.log();
    }

  } catch (err: any) {
    console.error('Error:', err.message);
    if (err.stack) {
      console.error('Stack:', err.stack);
    }
  }
}

testWithRealSimulation().catch(console.error);
