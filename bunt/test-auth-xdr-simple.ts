/**
 * Simple test to understand XDR auth entry reconstruction
 * Works purely with XDR structures, no network calls needed
 */

import { xdr, Address, Keypair, StrKey } from '@stellar/stellar-sdk';

function testAuthEntryXDR() {
  console.log('=== Testing Auth Entry XDR Reconstruction ===\n');

  // Use a random keypair for testing
  const player1Keypair = Keypair.random();
  const player1Address = player1Keypair.publicKey();

  console.log('Player 1 address:', player1Address);
  console.log();

  // Step 1: Create a minimal stubbed auth entry structure
  // This simulates what comes from simulation
  console.log('Step 1: Creating stubbed auth entry (simulating what RPC returns)...');

  const scAddress = Address.fromString(player1Address).toScAddress();
  const nonce = BigInt('8052764697707046694'); // From the sample JSON

  // Create stubbed credentials with void signature
  const stubbedCredentials = new xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: scAddress,
      nonce: xdr.Int64.fromString(nonce.toString()),
      signatureExpirationLedger: 0,
      signature: xdr.ScVal.scvVoid(), // Stubbed auth has void signature
    })
  );

  // Create a simple contract function invocation (start_game with session_id and wager)
  const contractAddress = Address.fromString('CDB6IODG5BNNVILLJXBXYZVR7NP4HDO2NL7WALWIXGIDMA6VY4V75CEX').toScAddress();
  const functionName = 'start_game';

  const args = [
    xdr.ScVal.scvU32(763821822), // session_id
    xdr.ScVal.scvI128(new xdr.Int128Parts({ hi: xdr.Int64.fromString('0'), lo: xdr.Uint64.fromString('1000000') })), // wager
  ];

  const invokeContractArgs = new xdr.InvokeContractArgs({
    contractAddress,
    functionName,
    args,
  });

  const contractFn = xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invokeContractArgs);

  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function: contractFn,
    subInvocations: [],
  });

  // Create the full stubbed auth entry
  const stubbedAuthEntry = new xdr.SorobanAuthorizationEntry({
    credentials: stubbedCredentials,
    rootInvocation,
  });

  console.log('✅ Created stubbed auth entry');
  console.log('Stubbed signature type:', stubbedAuthEntry.credentials().address().signature().switch());
  console.log();

  // Step 2: Serialize stubbed entry (this should work)
  console.log('Step 2: Serializing stubbed auth entry...');
  try {
    const stubbedXdr = stubbedAuthEntry.toXDR('base64');
    console.log('✅ Stubbed auth entry XDR (length:', stubbedXdr.length, ')');
    console.log('First 100 chars:', stubbedXdr.substring(0, 100));
    console.log();
  } catch (err: any) {
    console.log('❌ Failed to serialize stubbed entry:', err.message);
    return;
  }

  // Step 3: Mock wallet signature
  console.log('Step 3: Creating mock signature...');
  const mockSignatureBytes = Buffer.alloc(64);
  crypto.getRandomValues(mockSignatureBytes);
  console.log('Mock signature (base64):', mockSignatureBytes.toString('base64'));
  console.log();

  // Step 4: Try to reconstruct with signature
  console.log('Step 4: Reconstructing auth entry with signature...');

  // Get the original credentials components
  const originalCreds = stubbedAuthEntry.credentials().address();
  const validUntilLedger = 59968075; // From the logs

  console.log('\nOriginal credentials components:');
  console.log('- Address:', Address.fromScAddress(originalCreds.address()).toString());
  console.log('- Nonce:', originalCreds.nonce().toString());
  console.log('- Expiration:', originalCreds.signatureExpirationLedger());
  console.log('- Signature type:', originalCreds.signature().switch());
  console.log();

  // Approach 1: Reconstruct everything step by step (reusing objects)
  console.log('Approach 1: Reusing address and nonce objects...');
  try {
    console.log('Nonce type:', typeof originalCreds.nonce());
    console.log('Nonce value:', originalCreds.nonce());
    console.log('Nonce toString:', originalCreds.nonce().toString());
    console.log('Address type:', typeof originalCreds.address());

    // Create signature SCVal
    const signatureSCVal = xdr.ScVal.scvBytes(mockSignatureBytes);
    console.log('Created signature SCVal, type:', signatureSCVal.switch());

    // Reconstruct credentials with reused objects
    const newAddressCredentials = new xdr.SorobanAddressCredentials({
      address: originalCreds.address(), // Reuse ScAddress
      nonce: originalCreds.nonce(), // Reuse nonce
      signatureExpirationLedger: validUntilLedger,
      signature: signatureSCVal,
    });
    console.log('Created new SorobanAddressCredentials');

    const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);
    console.log('Created new SorobanCredentials');

    const newAuthEntry = new xdr.SorobanAuthorizationEntry({
      credentials: newCredentials,
      rootInvocation: stubbedAuthEntry.rootInvocation(), // Reuse root invocation
    });
    console.log('Created new SorobanAuthorizationEntry');

    // Try to serialize
    const signedXdr = newAuthEntry.toXDR('base64');
    console.log('✅ SUCCESS! Signed auth entry XDR (length:', signedXdr.length, ')');
    console.log('First 100 chars:', signedXdr.substring(0, 100));
    console.log();
  } catch (err: any) {
    console.log('❌ FAILED:', err.message);
    console.log('Stack:', err.stack);
    console.log();
  }

  // Approach 1b: Same as 1 but serialize stubbed entry to XDR first, then parse it
  console.log('Approach 1b: Parse from XDR then reconstruct...');
  try {
    // First serialize the stubbed entry
    const stubbedXdr = stubbedAuthEntry.toXDR('base64');
    // Then parse it back
    const parsedStubbed = xdr.SorobanAuthorizationEntry.fromXDR(stubbedXdr, 'base64');
    const parsedCreds = parsedStubbed.credentials().address();

    console.log('Parsed nonce type:', typeof parsedCreds.nonce());
    console.log('Parsed nonce value:', parsedCreds.nonce());

    const signatureSCVal = xdr.ScVal.scvBytes(mockSignatureBytes);

    const newAddressCredentials = new xdr.SorobanAddressCredentials({
      address: parsedCreds.address(),
      nonce: parsedCreds.nonce(),
      signatureExpirationLedger: validUntilLedger,
      signature: signatureSCVal,
    });

    const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);

    const newAuthEntry = new xdr.SorobanAuthorizationEntry({
      credentials: newCredentials,
      rootInvocation: parsedStubbed.rootInvocation(),
    });

    const signedXdr = newAuthEntry.toXDR('base64');
    console.log('✅ SUCCESS! Signed auth entry XDR (length:', signedXdr.length, ')');
    console.log();
  } catch (err: any) {
    console.log('❌ FAILED:', err.message);
    console.log();
  }

  // Approach 2: Check if the issue is with nonce type
  console.log('Approach 2: Creating fresh nonce from BigInt...');
  try {
    const signatureSCVal = xdr.ScVal.scvBytes(mockSignatureBytes);

    const newAddressCredentials = new xdr.SorobanAddressCredentials({
      address: originalCreds.address(),
      nonce: xdr.Int64.fromString(nonce.toString()), // Fresh nonce from string
      signatureExpirationLedger: validUntilLedger,
      signature: signatureSCVal,
    });

    const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);

    const newAuthEntry = new xdr.SorobanAuthorizationEntry({
      credentials: newCredentials,
      rootInvocation: stubbedAuthEntry.rootInvocation(),
    });

    const signedXdr = newAuthEntry.toXDR('base64');
    console.log('✅ SUCCESS! Signed auth entry XDR (length:', signedXdr.length, ')');
    console.log();
  } catch (err: any) {
    console.log('❌ FAILED:', err.message);
    console.log();
  }

  // Approach 3: Parse the stubbed XDR and modify it
  console.log('Approach 3: Parse stubbed XDR, modify, re-serialize...');
  try {
    const stubbedXdr = stubbedAuthEntry.toXDR('base64');
    const parsedEntry = xdr.SorobanAuthorizationEntry.fromXDR(stubbedXdr, 'base64');
    console.log('Parsed stubbed entry from XDR');

    const signatureSCVal = xdr.ScVal.scvBytes(mockSignatureBytes);
    const parsedCreds = parsedEntry.credentials().address();

    const newAddressCredentials = new xdr.SorobanAddressCredentials({
      address: parsedCreds.address(),
      nonce: parsedCreds.nonce(),
      signatureExpirationLedger: validUntilLedger,
      signature: signatureSCVal,
    });

    const newCredentials = xdr.SorobanCredentials.sorobanCredentialsAddress(newAddressCredentials);

    const newAuthEntry = new xdr.SorobanAuthorizationEntry({
      credentials: newCredentials,
      rootInvocation: parsedEntry.rootInvocation(),
    });

    const signedXdr = newAuthEntry.toXDR('base64');
    console.log('✅ SUCCESS! Signed auth entry XDR (length:', signedXdr.length, ')');
    console.log();
  } catch (err: any) {
    console.log('❌ FAILED:', err.message);
    console.log();
  }
}

// Run the test
testAuthEntryXDR();
