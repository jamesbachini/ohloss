#!/usr/bin/env bun

/**
 * Test: Parse Real Deep Link URL
 *
 * Tests the exact URL provided by the user to see what's failing
 */

const realUrl = 'http://localhost:5173/?game=number-guess&auth=AAAAAQAAAAAAAAAAPPCVT2m9AIJnBpLzvo6Q6iGJ5dGMSJ1XxGhWnGBWE4NUMrieGMphfgOTzxYAAAAQAAAAAQAAAAEAAAARAAAAAQAAAAIAAAAPAAAACnB1YmxpY19rZXkAAAAAAA0AAAAgPPCVT2m9AIJnBpLzvo6Q6iGJ5dGMSJ1XxGhWnGBWE4MAAAAPAAAACXNpZ25hdHVyZQAAAAAAAA0AAABAWsbyrNbM%2Bcmw73iHreq0jRUwTa6NI6Zq3CbNVk7v3D7tnEIjHcVZ2I%2FeBEC7sevVxo93PPZ%2BIoLvQ29jjCTBDgAAAAAAAAABw%2BQ4Zuha2qFrTcN8ZrH7X8ON2mr%2FYC7IuZA2A9XHK%2F4AAAAKc3RhcnRfZ2FtZQAAAAAAAgAAAAMtibBmAAAACgAAAAAAAAAAAAAAAAAPQkAAAAABAAAAAAAAAAEO9dSDto9saI6YpkENXcxOAPSrJHdjHh1zysCxhUymGAAAAApzdGFydF9nYW1lAAAAAAADAAAAEgAAAAHD5Dhm6FraoWtNw3xmsftfw43aav9gLsi5kDYD1ccr%2FgAAAAMtibBmAAAACgAAAAAAAAAAAAAAAAAPQkAAAAAA';

console.log('\n🧪 Testing Real Deep Link URL\n');
console.log('URL:', realUrl);
console.log('');

try {
  // Step 1: Parse URL like GamesCatalog does
  console.log('Step 1: GamesCatalog URL Parsing');
  const urlObj = new URL(realUrl);
  const params = new URLSearchParams(urlObj.search);

  const gameParam = params.get('game');
  const authParam = params.get('auth');
  const xdrParam = params.get('xdr');

  console.log('  - game:', gameParam);
  console.log('  - auth:', authParam ? 'Found (length: ' + authParam.length + ')' : 'Not found');
  console.log('  - xdr:', xdrParam ? 'Found' : 'Not found');
  console.log('');

  if (!authParam && !xdrParam) {
    throw new Error('❌ No auth parameter found!');
  }

  // Step 2: Decode like GamesCatalog does
  console.log('Step 2: Decoding Auth Parameter');
  const authEntryXDR = authParam || xdrParam;
  const decodedXDR = decodeURIComponent(authEntryXDR!);

  console.log('  - Encoded length:', authEntryXDR?.length);
  console.log('  - Decoded length:', decodedXDR.length);
  console.log('  - Decoded XDR preview:', decodedXDR.substring(0, 100) + '...');
  console.log('');

  // Step 3: Parse auth entry like NumberGuessGame does
  console.log('Step 3: Parsing Auth Entry');
  console.log('  This would call numberGuessService.parseAuthEntry()');
  console.log('  Expected to extract:');
  console.log('    - Session ID');
  console.log('    - Player 1 address');
  console.log('    - Player 1 wager');
  console.log('');

  // Step 4: Check game existence
  console.log('Step 4: Check Game Existence');
  console.log('  This would call numberGuessService.getGame(sessionId)');
  console.log('  If game exists → load directly');
  console.log('  If game not found → import mode with pre-filled values');
  console.log('');

  // Step 5: Simulate what should happen
  console.log('Step 5: Expected Behavior');
  console.log('  ✅ GamesCatalog should set:');
  console.log('     - selectedGame = "number-guess"');
  console.log('     - initialXDR = decodedXDR');
  console.log('');
  console.log('  ✅ GamesCatalog should render:');
  console.log('     - <NumberGuessGame initialXDR={decodedXDR} />');
  console.log('');
  console.log('  ✅ NumberGuessGame useEffect should:');
  console.log('     1. Read auth parameter from URL');
  console.log('     2. Parse session ID from auth entry');
  console.log('     3. Check if game exists on-chain');
  console.log('     4a. If exists → setGamePhase("guess")');
  console.log('     4b. If not → setCreateMode("import") + pre-fill fields');
  console.log('');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ URL Structure is Valid');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('The URL should trigger the deep link flow.');
  console.log('If it\'s not working, check:');
  console.log('  1. Is GamesCatalog detecting the auth parameter?');
  console.log('  2. Is NumberGuessGame\'s useEffect running?');
  console.log('  3. Are there any console errors in the browser?');
  console.log('  4. Is the component already mounted before URL is processed?');
  console.log('');
  console.log('Next step: Add debug console.logs to frontend components');
  console.log('');

} catch (error: any) {
  console.error('❌ FAILED:', error.message);
  process.exit(1);
}
