/**
 * Test parsing a real signed auth entry to extract game parameters
 * This helps debug why auto-fill isn't working in the frontend
 */

import { xdr, Address } from '@stellar/stellar-sdk';

// The actual auth entry XDR from the screenshot
const AUTH_ENTRY_XDR = 'AAAAAQAAAAAAAAAAgyhUFD59mzZfBbzrVZy1vg5Ai2iJ0nWZOGl4cZVs/q1vwSrTwqJnJgOTCksAAAANAAAAAQAAADA8PAlU9pvQCCZwaS877o6Q6iGJ5dGMSJ1XxGhWnGBWE4MAAAA64ie/Gb6WGnme3r/cXJpN+EXp5Gu0COQ0EOburHzuz/w3f0ndGvVDKJxaqIv5kGXTEgWWZNEdMagEOjRGfu0MRgIAAAABAAAAAQAAAAFAAAAAAAAAAAHD5Dhm6Fra55IAIWcGkv74JDLZCHJ1YMSJ1XxGhWnGBWE4MAAAAAoAAABzdGFydF9nYW1lAAAAAAAAAAAAANsyNtYAAAAAAAAABlAAAAAAAAAAAAAAAAEAAAABAAAAAcPkOGbqWtrngQAhZwaS/vgkMtkIcnVgxInVfEaFacYFYwAAAAoAAABzdGFydF9nYW1lAAAAAAAAAAAAANsyNtYAAAAAAAAABlAAAAAAAAAAAA==';

function testParseAuthEntry() {
  console.log('=== Testing Auth Entry Parsing ===\n');

  try {
    // Parse the auth entry from XDR
    const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(AUTH_ENTRY_XDR, 'base64');
    console.log('✅ Successfully parsed auth entry from XDR\n');

    // Step 1: Extract Player 1's address from credentials
    console.log('Step 1: Extracting Player 1 address from credentials...');
    const credentials = authEntry.credentials();
    console.log('Credentials type:', credentials.switch().name);

    const addressCreds = credentials.address();
    const player1Address = addressCreds.address();
    const player1 = Address.fromScAddress(player1Address).toString();
    console.log('Player 1 address:', player1);
    console.log('Nonce:', addressCreds.nonce().toString());
    console.log('Signature expiration:', addressCreds.signatureExpirationLedger());
    console.log('Signature type:', addressCreds.signature().switch().name);
    console.log();

    // Step 2: Get the root invocation
    console.log('Step 2: Getting root invocation...');
    const rootInvocation = authEntry.rootInvocation();
    console.log('Got root invocation');
    console.log();

    // Step 3: Get the authorized function
    console.log('Step 3: Getting authorized function...');
    const authorizedFunction = rootInvocation.function();
    console.log('Authorized function type:', authorizedFunction.switch().name);
    console.log();

    // Step 4: Try to extract the contract function
    console.log('Step 4: Extracting contract function...');

    // Check if it's a contract function type
    const functionType = authorizedFunction.switch().name;
    console.log('Function switch name:', functionType);

    if (functionType === 'sorobanAuthorizedFunctionTypeContractFn') {
      console.log('✅ This is a contract function invocation');

      // Extract using contractFn()
      const contractFn = authorizedFunction.contractFn();
      console.log('Contract address:', Address.fromScAddress(contractFn.contractAddress()).toString());

      // Get function name
      const functionName = contractFn.functionName().toString();
      console.log('Function name:', functionName);

      // Get args
      const args = contractFn.args();
      console.log('Number of args:', args.length);
      console.log();

      // Step 5: Extract the arguments
      console.log('Step 5: Extracting arguments...');
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const argType = arg.switch().name;
        console.log(`Arg ${i} type:`, argType);

        try {
          if (argType === 'scvU32') {
            const value = arg.u32();
            console.log(`Arg ${i} value (u32):`, value);
          } else if (argType === 'scvI128') {
            const i128 = arg.i128();
            const value = i128.lo().toBigInt();
            console.log(`Arg ${i} value (i128):`, value.toString());
          }
        } catch (err: any) {
          console.log(`Arg ${i} extraction error:`, err.message);
        }
      }
      console.log();

      // Step 6: Extract the specific values we need
      console.log('Step 6: Extracting game parameters...');
      const sessionId = args[0].u32();
      const player1Wager = args[1].i128().lo().toBigInt();

      console.log('\n=== EXTRACTED GAME PARAMETERS ===');
      console.log('Session ID:', sessionId);
      console.log('Player 1:', player1);
      console.log('Player 1 Wager (stroops):', player1Wager.toString());
      console.log('Player 1 Wager (FP):', (Number(player1Wager) / 10_000_000).toString());
      console.log('Function Name:', functionName);
      console.log('=================================\n');

      return {
        sessionId,
        player1,
        player1Wager,
        functionName,
      };

    } else {
      console.log('❌ Unexpected function type:', functionType);
      console.log('Available methods:', Object.keys(authorizedFunction));
    }

  } catch (err: any) {
    console.error('\n❌ Error:', err.message);
    console.error('Stack:', err.stack);
  }
}

// Run the test
const result = testParseAuthEntry();

if (result) {
  console.log('✅ SUCCESS! Parsing works correctly.');
  console.log('Result:', result);
} else {
  console.log('❌ FAILED! Parsing did not return expected result.');
}
