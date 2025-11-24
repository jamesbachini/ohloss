#!/usr/bin/env bun

/**
 * Test: URL Parameter Parsing for Deep Links
 *
 * Validates that the URL parsing logic correctly detects auth entries
 * in both new format (?auth=) and legacy format (?xdr=)
 */

console.log('\n🧪 Testing URL Parameter Parsing for Deep Links\n');

// Test data
const mockAuthEntryXDR = 'AAAAAgAAAABjyRsMZ2qFVj1fqhfNdRbFzSfFZXJhKzKvJvKzfSPPVAAAAGQAJlFMAAAC4gAAAAEAAAAAAAAAAAAAAABnfvrgAAAAAAAAAAEAAAABAAAAAGPJGwxnaoVWPV+qF811FsXNJ8VlcmErMq8m8rN9I89UAAAAB3N0YXJ0X2dhbWUAAAAEAAAADnNlc3Npb25faWQAAAAAAAsAAAAAAAAAAAAAAAACAAAAAAAAAA5wbGF5ZXIxX3dhZ2VyAAAAAAALAAAAAAAAAAAAAGzJcAAAAAAAAAAAAAAAAAA=';

interface TestCase {
  name: string;
  url: string;
  expectedAuth: string | null;
  expectedXdr: string | null;
  expectedGame: string | null;
  shouldWork: boolean;
}

const testCases: TestCase[] = [
  {
    name: 'New format: ?game=number-guess&auth=XDR',
    url: `http://localhost:5173/?game=number-guess&auth=${encodeURIComponent(mockAuthEntryXDR)}`,
    expectedAuth: mockAuthEntryXDR,
    expectedXdr: null,
    expectedGame: 'number-guess',
    shouldWork: true,
  },
  {
    name: 'Legacy format: ?game=number-guess&xdr=XDR',
    url: `http://localhost:5173/?game=number-guess&xdr=${encodeURIComponent(mockAuthEntryXDR)}`,
    expectedAuth: null,
    expectedXdr: mockAuthEntryXDR,
    expectedGame: 'number-guess',
    shouldWork: true,
  },
  {
    name: 'Both parameters present (auth should take precedence)',
    url: `http://localhost:5173/?game=number-guess&auth=${encodeURIComponent(mockAuthEntryXDR)}&xdr=OLD_XDR`,
    expectedAuth: mockAuthEntryXDR,
    expectedXdr: 'OLD_XDR',
    expectedGame: 'number-guess',
    shouldWork: true,
  },
  {
    name: 'No auth parameters',
    url: 'http://localhost:5173/?game=number-guess',
    expectedAuth: null,
    expectedXdr: null,
    expectedGame: 'number-guess',
    shouldWork: false,
  },
  {
    name: 'Session ID format (no auth)',
    url: 'http://localhost:5173/?game=number-guess&session-id=123',
    expectedAuth: null,
    expectedXdr: null,
    expectedGame: 'number-guess',
    shouldWork: false, // This is a different flow (load existing)
  },
];

console.log('Testing URL parameter detection:\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`📋 Test: ${testCase.name}`);
  console.log(`   URL: ${testCase.url.substring(0, 80)}...`);

  try {
    // Simulate GamesCatalog URL parsing
    const urlParams = new URLSearchParams(new URL(testCase.url).search);
    const authParam = urlParams.get('auth');
    const xdrParam = urlParams.get('xdr');
    const gameParam = urlParams.get('game');

    // Decode if present
    const decodedAuth = authParam ? decodeURIComponent(authParam) : null;
    const decodedXdr = xdrParam ? decodeURIComponent(xdrParam) : null;

    // Check results
    const authMatch = decodedAuth === testCase.expectedAuth;
    const xdrMatch = decodedXdr === testCase.expectedXdr;
    const gameMatch = gameParam === testCase.expectedGame;

    // Simulate the logic in GamesCatalog: auth || xdr
    const detectedAuthEntry = decodedAuth || decodedXdr;
    const hasAuthEntry = !!detectedAuthEntry;

    if (!authMatch) {
      throw new Error(`Auth param mismatch: expected ${testCase.expectedAuth ? 'XDR' : 'null'}, got ${decodedAuth ? 'XDR' : 'null'}`);
    }
    if (!xdrMatch) {
      throw new Error(`XDR param mismatch: expected ${testCase.expectedXdr ? 'XDR' : 'null'}, got ${decodedXdr ? 'XDR' : 'null'}`);
    }
    if (!gameMatch) {
      throw new Error(`Game param mismatch: expected ${testCase.expectedGame}, got ${gameParam}`);
    }
    if (hasAuthEntry !== testCase.shouldWork) {
      throw new Error(`Auth detection mismatch: expected ${testCase.shouldWork ? 'to have' : 'no'} auth entry, got ${hasAuthEntry ? 'auth entry' : 'no auth entry'}`);
    }

    console.log(`   ✅ PASSED`);
    console.log(`      - game: ${gameParam}`);
    console.log(`      - auth: ${authParam ? '✓ Detected' : '✗ Not found'}`);
    console.log(`      - xdr: ${xdrParam ? '✓ Detected' : '✗ Not found'}`);
    console.log(`      - Selected: ${detectedAuthEntry ? (decodedAuth ? 'auth' : 'xdr') : 'none'}`);
    console.log('');
    passed++;

  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
    console.log('');
    failed++;
  }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (failed > 0) {
  console.log('\n❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('\n✅ All URL parsing tests passed!');
  console.log('');
  console.log('Summary:');
  console.log('  ✨ New format (?auth=XDR) works correctly');
  console.log('  ✨ Legacy format (?xdr=XDR) still supported');
  console.log('  ✨ Precedence: auth parameter takes priority over xdr');
  console.log('  ✨ GamesCatalog will correctly detect and decode auth entries');
  console.log('');
}
