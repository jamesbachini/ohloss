/**
 * Validate the fixed injection approach
 * Simulates the AssembledTransaction structure and tests direct mutation
 */

import { xdr, Address } from '@stellar/stellar-sdk';

const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB';
const CONTRACT_ADDRESS = 'CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU';

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

function testInjection() {
  console.log('=== Validating Fixed Injection Approach ===\n');

  const sessionId = 123456789;
  const wager = BigInt(1_0000000);

  // Step 1: Create signed and stubbed entries
  console.log('Step 1: Creating auth entries...');
  const player1SignedEntry = createMockAuthEntry(PLAYER1, sessionId, wager, true);
  const player1StubbedEntry = createMockAuthEntry(PLAYER1, sessionId, wager, false);
  const player2StubbedEntry = createMockAuthEntry(PLAYER2, sessionId, wager, false);
  console.log('✅ Created entries\n');

  // Step 2: Simulate AssembledTransaction structure
  console.log('Step 2: Creating mock AssembledTransaction structure...');
  const mockTx = {
    simulationData: {
      result: {
        auth: [player1StubbedEntry, player2StubbedEntry],
        retval: xdr.ScVal.scvVoid(),
      },
    },
  };
  console.log('Initial auth entries:');
  for (let i = 0; i < mockTx.simulationData.result.auth.length; i++) {
    const entry = mockTx.simulationData.result.auth[i];
    const addr = Address.fromScAddress(entry.credentials().address().address()).toString();
    const sigType = entry.credentials().address().signature().switch().name;
    console.log(`  [${i}] ${addr} - ${sigType}`);
  }
  console.log();

  // Step 3: Inject using DIRECT MUTATION
  console.log('Step 3: Injecting Player 1 signed entry (direct mutation)...');
  const authEntries = mockTx.simulationData.result.auth;

  // Find Player 1's entry
  let matchIndex = -1;
  for (let i = 0; i < authEntries.length; i++) {
    const entryAddress = authEntries[i].credentials().address().address();
    const entryAddressString = Address.fromScAddress(entryAddress).toString();
    if (entryAddressString === PLAYER1) {
      matchIndex = i;
      console.log(`Found Player 1 at index ${i}`);
      break;
    }
  }

  if (matchIndex === -1) {
    console.log('❌ Player 1 not found');
    return;
  }

  // DIRECT MUTATION - this is the key fix
  authEntries[matchIndex] = player1SignedEntry;
  console.log('✅ Directly mutated auth entry at index', matchIndex);
  console.log();

  // Step 4: Verify the mutation worked
  console.log('Step 4: Verifying mutation...');
  console.log('Final auth entries:');
  for (let i = 0; i < mockTx.simulationData.result.auth.length; i++) {
    const entry = mockTx.simulationData.result.auth[i];
    const addr = Address.fromScAddress(entry.credentials().address().address()).toString();
    const sigType = entry.credentials().address().signature().switch().name;
    const status = sigType === 'scvBytes' ? '✅' : '⚠️';
    console.log(`  ${status} [${i}] ${addr} - ${sigType}`);
  }
  console.log();

  // Step 5: Verify the reference is maintained
  console.log('Step 5: Verifying reference integrity...');
  const isSameArray = authEntries === mockTx.simulationData.result.auth;
  console.log('Auth entries is same reference:', isSameArray);

  const player1Entry = mockTx.simulationData.result.auth[matchIndex];
  const isSigned = player1Entry.credentials().address().signature().switch().name === 'scvBytes';
  console.log('Player 1 entry is signed:', isSigned);
  console.log();

  if (isSigned && isSameArray) {
    console.log('✅ SUCCESS! Direct mutation approach works correctly.');
    console.log('   The auth array reference is maintained, and the entry is properly signed.');
  } else {
    console.log('❌ FAILED! Something went wrong.');
  }
}

testInjection();
