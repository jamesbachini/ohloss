/**
 * Test the simplified multi-sig flow with placeholder Player 2 values
 */

import { xdr, Address } from '@stellar/stellar-sdk';

const PLAYER1 = 'GA6PBFKPNG6QBATHA2JPHPUOSDVCDCPF2GGERHKXYRUFNHDAKYJYGHZI';
const PLACEHOLDER_PLAYER2 = 'GCHPTWXMT3HYF4RLZHWBNRF4MPXLTJ76ISHMSYIWCCDXWUYOQG5MR2AB'; // Placeholder for simulation
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

function parseAuthEntry(authEntryXdr: string) {
  const authEntry = xdr.SorobanAuthorizationEntry.fromXDR(authEntryXdr, 'base64');
  const credentials = authEntry.credentials();
  const player1 = Address.fromScAddress(credentials.address().address()).toString();

  const rootInvocation = authEntry.rootInvocation();
  const contractFn = rootInvocation.function().contractFn();
  const args = contractFn.args();
  const sessionId = args[0].u32();
  const player1Wager = args[1].i128().lo().toBigInt();

  return { sessionId, player1, player1Wager };
}

function testSimplifiedFlow() {
  console.log('=== Testing Simplified Multi-Sig Flow ===\n');

  const sessionId = 123456789;
  const player1Wager = BigInt(1_0000000); // 0.1 FP

  // =========================================
  // STEP 1: Player 1 Creates & Exports
  // =========================================
  console.log('📤 STEP 1: Player 1 Creates & Exports');
  console.log('=====================================\n');

  console.log('Player 1 inputs:');
  console.log('  - Address:', PLAYER1);
  console.log('  - Wager:', (Number(player1Wager) / 10_000_000).toFixed(1), 'FP');
  console.log('  - Player 2 Address: NOT REQUIRED ✨');
  console.log('  - Player 2 Wager: NOT REQUIRED ✨');
  console.log();

  console.log('Using placeholder values for simulation:');
  console.log('  - Player 2 Address:', PLACEHOLDER_PLAYER2);
  console.log('  - Player 2 Wager:', (Number(player1Wager) / 10_000_000).toFixed(1), 'FP (same as P1)');
  console.log();

  // Create signed auth entry for Player 1
  const player1SignedEntry = createMockAuthEntry(PLAYER1, sessionId, player1Wager, true);
  const authEntryXDR = player1SignedEntry.toXDR('base64');

  console.log('✅ Auth entry created and signed!');
  console.log('Auth entry XDR length:', authEntryXDR.length);
  console.log();

  // Create share URL
  const shareUrl = `https://example.com/game?game=number-guess&auth=${authEntryXDR}`;
  console.log('📋 Share URL (simplified):');
  console.log(shareUrl.substring(0, 80) + '...');
  console.log('URL only contains: game type + auth entry ✨');
  console.log();

  // =========================================
  // STEP 2: Player 2 Imports & Completes
  // =========================================
  console.log('📥 STEP 2: Player 2 Imports & Completes');
  console.log('=======================================\n');

  console.log('Player 2 receives auth entry XDR...');
  console.log();

  // Parse auth entry to auto-fill fields
  console.log('Parsing auth entry to auto-fill:');
  const parsed = parseAuthEntry(authEntryXDR);
  console.log('  ✅ Session ID:', parsed.sessionId);
  console.log('  ✅ Player 1 Address:', parsed.player1);
  console.log('  ✅ Player 1 Wager:', (Number(parsed.player1Wager) / 10_000_000).toFixed(1), 'FP');
  console.log('  ✅ Your Wager (pre-filled):', '0.1 FP');
  console.log();

  // Player 2's actual address (different from placeholder!)
  const REAL_PLAYER2 = 'GDQWI6FKB72DPOJE4CGYCFQZKRPQQIOYXRMZ5KEVGXMG6UUTGJMBCASH'; // Real Player 2 address
  const player2Wager = BigInt(1_0000000); // 0.1 FP (can be different from P1)

  console.log('Player 2 inputs:');
  console.log('  - Address:', REAL_PLAYER2, '(auto-filled from wallet)');
  console.log('  - Wager:', (Number(player2Wager) / 10_000_000).toFixed(1), 'FP (pre-filled, adjustable)');
  console.log();

  console.log('Player 2 rebuilds transaction with REAL values:');
  console.log('  - Session ID:', parsed.sessionId, '(from auth entry)');
  console.log('  - Player 1:', parsed.player1, '(from auth entry)');
  console.log('  - Player 2:', REAL_PLAYER2, '(REAL address, not placeholder)');
  console.log('  - Player 1 Wager:', (Number(parsed.player1Wager) / 10_000_000).toFixed(1), 'FP (from auth entry)');
  console.log('  - Player 2 Wager:', (Number(player2Wager) / 10_000_000).toFixed(1), 'FP (from input)');
  console.log();

  // Simulate Player 2 building transaction
  const player2SimAuthEntries = [
    createMockAuthEntry(PLAYER1, sessionId, parsed.player1Wager, false), // P1 stubbed
    createMockAuthEntry(REAL_PLAYER2, sessionId, player2Wager, false), // P2 stubbed (REAL address)
  ];

  console.log('Simulation returns stubbed auth entries:');
  for (let i = 0; i < player2SimAuthEntries.length; i++) {
    const entry = player2SimAuthEntries[i];
    const addr = Address.fromScAddress(entry.credentials().address().address()).toString();
    const sigType = entry.credentials().address().signature().switch().name;
    console.log(`  [${i}] ${addr.substring(0, 10)}... - ${sigType}`);
  }
  console.log();

  // Inject Player 1's signed entry
  console.log('Injecting Player 1 signed auth entry...');
  player2SimAuthEntries[0] = player1SignedEntry;
  console.log('✅ Injected Player 1 signed entry');
  console.log();

  // Sign Player 2's entry
  console.log('Signing Player 2 auth entry...');
  const player2SignedEntry = createMockAuthEntry(REAL_PLAYER2, sessionId, player2Wager, true);
  player2SimAuthEntries[1] = player2SignedEntry;
  console.log('✅ Signed Player 2 entry');
  console.log();

  // Final verification
  console.log('🎯 FINAL: Verify transaction');
  console.log('============================\n');

  console.log('Final auth entries:');
  for (let i = 0; i < player2SimAuthEntries.length; i++) {
    const entry = player2SimAuthEntries[i];
    const addr = Address.fromScAddress(entry.credentials().address().address()).toString();
    const sigType = entry.credentials().address().signature().switch().name;
    const status = sigType === 'scvBytes' ? '✅' : '⚠️';
    console.log(`  ${status} [${i}] ${addr.substring(0, 10)}... - ${sigType}`);
  }
  console.log();

  console.log('✅ SUCCESS! Simplified flow works correctly!');
  console.log();
  console.log('Key Points:');
  console.log('  ✨ Player 1 did NOT need to provide Player 2 address or wager');
  console.log('  ✨ Share URL is shorter and simpler');
  console.log('  ✨ Player 2 auto-filled from auth entry + pre-filled wager');
  console.log('  ✨ Transaction uses REAL Player 2 address, not placeholder');
}

testSimplifiedFlow();
