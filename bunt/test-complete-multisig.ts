/**
 * Complete multi-sig flow test
 * Test the entire flow from start to finish with proper handling
 */

import { xdr, Address, contract } from '@stellar/stellar-sdk';

const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';
const CONTRACT_ADDRESS = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

function createMockAuthEntry(playerAddress: string, sessionId: number, wager: bigint, isSigned: boolean = false) {
  const scAddress = Address.fromString(playerAddress).toScAddress();
  const nonce = BigInt(Math.floor(Math.random() * 1e18));

  const signature = isSigned
    ? xdr.ScVal.scvBytes(Buffer.alloc(64, 0xff))
    : xdr.ScVal.scvVoid();

  const credentials = new xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: scAddress,
      nonce: xdr.Int64.fromString(nonce.toString()),
      signatureExpirationLedger: isSigned ? 60000000 : 0,
      signature,
    })
  );

  const contractScAddress = Address.fromString(CONTRACT_ADDRESS).toScAddress();
  const functionName = 'start_game';

  const args = [
    xdr.ScVal.scvU32(sessionId),
    xdr.ScVal.scvI128(
      new xdr.Int128Parts({
        hi: xdr.Int64.fromString('0'),
        lo: xdr.Uint64.fromString(wager.toString()),
      })
    ),
  ];

  const invokeContractArgs = new xdr.InvokeContractArgs({
    contractAddress: contractScAddress,
    functionName,
    args,
  });

  const contractFn = xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invokeContractArgs);

  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function: contractFn,
    subInvocations: [],
  });

  return new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation,
  });
}

async function testCompleteMultiSig() {
  console.log('=== Testing Complete Multi-Sig Flow ===\n');

  const sessionId = 763993255;
  const wager = BigInt(1_000_000);

  // ========================================
  // STEP 1: Player 1 exports signed auth entry
  // ========================================
  console.log('📤 STEP 1: Player 1 prepares and exports');
  console.log('========================================\n');

  const player1SignedEntry = createMockAuthEntry(PLAYER1, sessionId, wager, true);
  const player1SignedEntryXdr = player1SignedEntry.toXDR('base64');

  console.log('Player 1 signed auth entry created');
  console.log('XDR length:', player1SignedEntryXdr.length);
  console.log('Signature type:', player1SignedEntry.credentials().address().signature().switch().name);
  console.log();

  // ========================================
  // STEP 2: Player 2 imports and rebuilds
  // ========================================
  console.log('📥 STEP 2: Player 2 imports and rebuilds');
  console.log('========================================\n');

  // Parse Player 1's auth entry
  console.log('2.1: Parsing Player 1 auth entry...');
  const parsedAuthEntry = xdr.SorobanAuthorizationEntry.fromXDR(player1SignedEntryXdr, 'base64');
  const parsedCreds = parsedAuthEntry.credentials().address();
  const parsedPlayer1 = Address.fromScAddress(parsedCreds.address()).toString();

  const rootInvocation = parsedAuthEntry.rootInvocation();
  const contractFn = rootInvocation.function().contractFn();
  const args = contractFn.args();
  const parsedSessionId = args[0].u32();
  const parsedPlayer1Wager = args[1].i128().lo().toBigInt();

  console.log('Extracted:');
  console.log('  Session ID:', parsedSessionId);
  console.log('  Player 1:', parsedPlayer1);
  console.log('  Player 1 Wager:', parsedPlayer1Wager.toString());
  console.log();

  // Simulate Player 2 building transaction
  console.log('2.2: Simulating Player 2 transaction build...');

  // Create stubbed auth entries (what simulation returns)
  const player1StubbedEntry = createMockAuthEntry(PLAYER1, sessionId, wager, false);
  const player2StubbedEntry = createMockAuthEntry(PLAYER2, sessionId, wager, false);

  // Create mock simulation data
  const mockSimulationData = {
    result: {
      auth: [player1StubbedEntry, player2StubbedEntry],
      retval: xdr.ScVal.scvVoid(),
    },
    transactionData: null,
    minResourceFee: '0',
    cost: {
      cpuInsns: '0',
      memBytes: '0',
    },
    latestLedger: 1000,
  };

  console.log('Simulation has', mockSimulationData.result.auth.length, 'auth entries:');
  for (let i = 0; i < mockSimulationData.result.auth.length; i++) {
    const entry = mockSimulationData.result.auth[i];
    try {
      const creds = entry.credentials();
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
  console.log();

  // ========================================
  // STEP 3: Inject Player 1's signed auth entry
  // ========================================
  console.log('🔧 STEP 3: Inject signed auth entry');
  console.log('===================================\n');

  console.log('3.1: Finding Player 1 stubbed entry...');
  let matchIndex = -1;
  const authEntries = mockSimulationData.result.auth;

  for (let i = 0; i < authEntries.length; i++) {
    try {
      const credentials = authEntries[i].credentials();
      const credType = credentials.switch().name;

      if (credType === 'sorobanCredentialsAddress') {
        const entryAddress = credentials.address().address();
        const entryAddressString = Address.fromScAddress(entryAddress).toString();

        console.log(`  Checking [${i}]: ${entryAddressString}`);

        if (entryAddressString === PLAYER1) {
          matchIndex = i;
          console.log(`  ✅ Found match at index ${i}`);
          break;
        }
      } else {
        console.log(`  Skipping [${i}]: ${credType}`);
      }
    } catch (err: any) {
      console.log(`  Error [${i}]:`, err.message);
    }
  }
  console.log();

  if (matchIndex === -1) {
    console.log('❌ No stubbed auth entry found');
    return;
  }

  console.log('3.2: Replacing stubbed entry with signed entry...');
  const updatedAuthEntries = [...authEntries];
  updatedAuthEntries[matchIndex] = parsedAuthEntry; // Use the parsed signed entry

  // Update simulation data (create new object since it might be read-only)
  const updatedSimulationData = {
    ...mockSimulationData,
    result: {
      ...mockSimulationData.result,
      auth: updatedAuthEntries,
    },
  };

  console.log('Updated auth entries:');
  for (let i = 0; i < updatedAuthEntries.length; i++) {
    const entry = updatedAuthEntries[i];
    try {
      const creds = entry.credentials();
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
  console.log();

  // ========================================
  // STEP 4: Sign Player 2's auth entry (if needed)
  // ========================================
  console.log('✍️  STEP 4: Sign Player 2 auth entry');
  console.log('====================================\n');

  // Check if Player 2 needs to sign
  // In this case, Player 2 might use source credentials (transaction source)
  // so they might not have an auth entry to sign

  console.log('Checking which accounts need to sign...');
  let player2NeedsSigning = false;
  let player2AuthIndex = -1;

  for (let i = 0; i < updatedAuthEntries.length; i++) {
    try {
      const creds = updatedAuthEntries[i].credentials();
      if (creds.switch().name === 'sorobanCredentialsAddress') {
        const addr = Address.fromScAddress(creds.address().address()).toString();
        const sigType = creds.address().signature().switch().name;

        if (addr === PLAYER2 && sigType === 'scvVoid') {
          player2NeedsSigning = true;
          player2AuthIndex = i;
          console.log(`  Player 2 needs to sign auth entry at index ${i}`);
        }
      }
    } catch (err: any) {
      // Skip
    }
  }

  if (player2NeedsSigning && player2AuthIndex !== -1) {
    console.log('Signing Player 2 auth entry...');
    // In real flow, this would call wallet.signAuthEntry()
    // For now, just create a signed version
    const player2SignedEntry = createMockAuthEntry(PLAYER2, sessionId, wager, true);
    updatedAuthEntries[player2AuthIndex] = player2SignedEntry;
    console.log('✅ Player 2 auth entry signed');
  } else {
    console.log('ℹ️  Player 2 does not need to sign (likely using source credentials)');
  }
  console.log();

  // ========================================
  // FINAL: Verify the result
  // ========================================
  console.log('🎯 FINAL: Verify auth entries');
  console.log('==============================\n');

  console.log('Final auth entries:');
  for (let i = 0; i < updatedAuthEntries.length; i++) {
    const entry = updatedAuthEntries[i];
    try {
      const creds = entry.credentials();
      const credType = creds.switch().name;

      if (credType === 'sorobanCredentialsAddress') {
        const addr = Address.fromScAddress(creds.address().address()).toString();
        const sigType = creds.address().signature().switch().name;
        const isSignedProperly = sigType !== 'scvVoid';
        const status = isSignedProperly ? '✅' : '⚠️';
        console.log(`  ${status} [${i}] ${addr} - ${sigType}`);
      } else {
        console.log(`  ℹ️  [${i}] ${credType} (source account)`);
      }
    } catch (err: any) {
      console.log(`  ❌ [${i}] Error:`, err.message);
    }
  }
  console.log();

  console.log('✅ SUCCESS! Multi-sig flow completed successfully.');
  console.log('Player 1 auth entry is signed, ready for submission.');
}

testCompleteMultiSig().catch(console.error);
