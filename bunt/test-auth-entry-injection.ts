/**
 * Test auth entry injection with mock AssembledTransaction
 * Understand where auth entries are and how to inject them properly
 */

import { xdr, Address, contract } from '@stellar/stellar-sdk';

const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';
const CONTRACT_ADDRESS = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

function createMockAuthEntry(playerAddress: string, sessionId: number, wager: bigint, isSigned: boolean = false) {
  const scAddress = Address.fromString(playerAddress).toScAddress();
  const nonce = BigInt(Math.floor(Math.random() * 1e18));

  // Create signature based on whether it's signed or stubbed
  const signature = isSigned
    ? xdr.ScVal.scvBytes(Buffer.alloc(64, 0xff)) // Mock signature
    : xdr.ScVal.scvVoid(); // Stubbed (void)

  const credentials = new xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: scAddress,
      nonce: xdr.Int64.fromString(nonce.toString()),
      signatureExpirationLedger: isSigned ? 60000000 : 0,
      signature,
    })
  );

  // Create contract function invocation
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

function testAuthEntryInjection() {
  console.log('=== Testing Auth Entry Injection ===\n');

  const sessionId = 123456789;
  const wager = BigInt(1_0000000);

  // Step 1: Create Player 1's SIGNED auth entry (what Player 1 exports)
  console.log('Step 1: Creating Player 1 SIGNED auth entry...');
  const player1SignedEntry = createMockAuthEntry(PLAYER1, sessionId, wager, true);
  const player1SignedEntryXdr = player1SignedEntry.toXDR('base64');

  const player1Creds = player1SignedEntry.credentials().address();
  console.log('Player 1 address:', Address.fromScAddress(player1Creds.address()).toString());
  console.log('Signature type:', player1Creds.signature().switch().name);
  console.log('Signed entry XDR length:', player1SignedEntryXdr.length);
  console.log();

  // Step 2: Create STUBBED auth entries for both players (what Player 2 gets from simulation)
  console.log('Step 2: Creating stubbed auth entries (simulating Player 2 transaction)...');
  const player1StubbedEntry = createMockAuthEntry(PLAYER1, sessionId, wager, false);
  const player2StubbedEntry = createMockAuthEntry(PLAYER2, sessionId, wager, false);

  console.log('Player 1 stubbed entry:');
  const p1StubbedCreds = player1StubbedEntry.credentials().address();
  console.log('  Address:', Address.fromScAddress(p1StubbedCreds.address()).toString());
  console.log('  Signature type:', p1StubbedCreds.signature().switch().name);

  console.log('Player 2 stubbed entry:');
  const p2StubbedCreds = player2StubbedEntry.credentials().address();
  console.log('  Address:', Address.fromScAddress(p2StubbedCreds.address()).toString());
  console.log('  Signature type:', p2StubbedCreds.signature().switch().name);
  console.log();

  // Step 3: Mock an AssembledTransaction structure
  console.log('Step 3: Creating mock AssembledTransaction with stubbed entries...');
  const mockSimulationData = {
    result: {
      auth: [player1StubbedEntry, player2StubbedEntry],
    },
    transactionData: null,
    minResourceFee: '0',
    cost: {
      cpuInsns: '0',
      memBytes: '0',
    },
    latestLedger: 1000,
  };

  console.log('Mock simulation data has', mockSimulationData.result.auth.length, 'auth entries');
  console.log();

  // Step 4: Try to find and inject Player 1's signed auth entry
  console.log('Step 4: Finding Player 1 stubbed entry to replace...');
  const authEntries = mockSimulationData.result.auth;
  const player1ScAddress = Address.fromString(PLAYER1).toScAddress();

  let matchIndex = -1;
  for (let i = 0; i < authEntries.length; i++) {
    try {
      const entryAddress = authEntries[i].credentials().address().address();
      const entryAddressString = Address.fromScAddress(entryAddress).toString();
      const signatureType = authEntries[i].credentials().address().signature().switch().name;

      console.log(`Auth entry ${i}:`);
      console.log(`  Address: ${entryAddressString}`);
      console.log(`  Signature: ${signatureType}`);
      console.log(`  Match Player 1: ${entryAddressString === PLAYER1}`);

      // Try ScAddress comparison
      const addressMatch = entryAddress.toXDR('base64') === player1ScAddress.toXDR('base64');
      console.log(`  XDR match: ${addressMatch}`);

      if (entryAddressString === PLAYER1) {
        matchIndex = i;
        console.log(`  ✅ Found match at index ${i}`);
      }
      console.log();
    } catch (err: any) {
      console.log(`Auth entry ${i} error:`, err.message);
    }
  }

  if (matchIndex === -1) {
    console.log('❌ No stubbed auth entry found for Player 1');
    return;
  }

  // Step 5: Inject the signed entry
  console.log('Step 5: Injecting Player 1 signed auth entry...');
  const parsedSignedEntry = xdr.SorobanAuthorizationEntry.fromXDR(player1SignedEntryXdr, 'base64');

  const updatedAuthEntries = [...authEntries];
  updatedAuthEntries[matchIndex] = parsedSignedEntry;

  console.log('Updated auth entries:');
  for (let i = 0; i < updatedAuthEntries.length; i++) {
    const entryAddress = updatedAuthEntries[i].credentials().address().address();
    const entryAddressString = Address.fromScAddress(entryAddress).toString();
    const signatureType = updatedAuthEntries[i].credentials().address().signature().switch().name;
    console.log(`  [${i}] ${entryAddressString} - ${signatureType}`);
  }
  console.log();

  console.log('✅ SUCCESS! Auth entry injection works correctly.');
  console.log('Player 1 auth entry is now SIGNED, Player 2 is still STUBBED.');
}

testAuthEntryInjection();
