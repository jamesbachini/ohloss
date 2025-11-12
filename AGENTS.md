# AGENTS.md - Available Tooling Reference

This document lists all available MCP tools and Task agents that can be used during development.

## Quick Start
- Reach for a Task agent when a problem spans multiple files or needs research; otherwise try local tooling first (`rg`, tests, docs).
- Skim the "Recommended Workflow" section before new feature work to avoid missing required setup steps.
- Remember the current CLI defaults: workspace writes are allowed, network access needs approval—plan remote-heavy tasks accordingly.
- Keep notes on which crates or repos you've already cached/fetched to avoid redundant network calls.

## Dependency Management

**CRITICAL: Always research package versions before adding or updating dependencies.**

### Current Core Dependencies
- **soroban-sdk**: 23.1.0
- **soroban-fixed-point-math**: git fork from github.com/kalepail/soroban-fixed-point-math

### Before Adding Dependencies:
1. Use WebSearch to find the latest stable version
2. Check crates.io for compatibility information
3. Ensure the new dependency uses soroban-sdk 23.1.0
4. Add to workspace dependencies in root Cargo.toml
5. Use `{ workspace = true }` in contract Cargo.toml

### Example:
```bash
# Research the package first
WebSearch("package-name latest version soroban compatibility 2025")

# Cache and review
rust-docs: cache_crate_from_cratesio("package-name", "x.y.z")
rust-docs: structure("package-name", "x.y.z")
```

## Task Agents

Launch specialized agents for complex, multi-step tasks using the Task tool.

### Explore Agent
**Best for:** Searching codebases, finding patterns, understanding structure

**When to use:**
- Finding files by pattern: "Find all .rs files in src/"
- Searching code: "Find all uses of fixed_mul_floor"
- Understanding structure: "How does fee-vault-v2 handle deposits?"
- If a quick `rg` search will do, try that first and jot down the query in case you need to escalate to Explore later.

**Thoroughness levels:**
- `quick` - Basic keyword search
- `medium` - Moderate exploration
- `very thorough` - Comprehensive analysis

**Example:**
```
Use Explore agent with "medium" thoroughness to find how Soroswap router handles swap operations
```

### General Purpose Agent
**Best for:** Complex multi-step tasks, research, code generation

**When to use:**
- Multi-step research
- Code refactoring
- Test generation
- Answering complex questions requiring multiple searches

**Example:**
```
Use general purpose agent to research Soroban contract upgrade patterns and provide implementation examples
```

### Plan Agent
**Best for:** Planning implementation approaches before coding

**When to use:**
- Breaking down complex features
- Exploring multiple implementation options
- Planning architecture decisions

## MCP Tools

### github
**Purpose:** Interact with GitHub repositories

**Key operations:**
- Read file contents: `get_file_contents(owner, repo, path)`
- Search code: `search_code(query)`
- List branches/commits: `list_branches(owner, repo)`
- Create/read issues and PRs
- Search repositories: `search_repositories(query)`

**Use for:**
- Studying fee-vault-v2 source code
- Understanding Soroswap router implementation
- Finding Soroban contract examples
- Searching for specific patterns in Stellar repos

**Example:**
```
get_file_contents("script3", "fee-vault-v2", "src/vault.rs")
search_code("soroban-sdk Map usage language:rust")
```

### rust-docs
**Purpose:** Query Rust crate documentation without downloading

**Key operations:**
- `list_cached_crates()` - See what's available offline
- `cache_crate_from_cratesio(name, version)` - Download crate docs
- `search_items_preview(crate, version, pattern)` - Quick search
- `get_item_details(crate, version, item_id)` - Full documentation
- `get_item_source(crate, version, item_id)` - View source code
- `structure(crate, version)` - View crate structure tree

**Use for:**
- Understanding soroban-sdk APIs (Map, Vec, Address, Env)
- Learning soroban-fixed-point-math functions
- Checking method signatures
- Viewing example implementations

**Workflow:**
```
1. cache_crate_from_cratesio("soroban-sdk", "23.1.0")
2. search_items_preview("soroban-sdk", "23.1.0", "Map")
3. get_item_details("soroban-sdk", "23.1.0", <item_id>)
4. get_item_source("soroban-sdk", "23.1.0", <item_id>)
```

### deepwiki
**Purpose:** Query documentation about GitHub repositories

**Key operations:**
- `read_wiki_structure(repoName)` - Get documentation topics
- `read_wiki_contents(repoName)` - View full documentation
- `ask_question(repoName, question)` - Ask specific questions

**Use for:**
- Understanding project architecture
- Finding API documentation
- Learning usage patterns

**Example:**
```
ask_question("script3/fee-vault-v2", "How do I integrate with a Blend pool?")
read_wiki_structure("soroswap/core")
```

### WebSearch
**Purpose:** Search the web for current information

**Use for:**
- Finding latest Soroban documentation
- Searching for recent blog posts or tutorials
- Checking for SDK updates
- Finding community discussions

**Example:**
```
"Soroban smart contract best practices 2025"
"soroban-sdk 23.1 release notes"
"Stellar Soroban storage optimization"
```

**Sandbox reminder:** Network access is restricted by default—queue the queries you need, then request approval once you know the exact URL or search phrase.

### WebFetch
**Purpose:** Fetch and analyze specific web pages

**Use for:**
- Reading specific documentation pages
- Fetching blog posts or tutorials
- Getting content from known URLs

**Example:**
```
https://developers.stellar.org/docs/build/smart-contracts/overview
https://github.com/stellar/soroban-examples
```

### cloudflare
**Purpose:** Search Cloudflare documentation

**Key operations:**
- `search_cloudflare_documentation(query)` - Search CF docs

**Use for:**
- Workers, Pages, R2, D1 documentation
- If deploying frontend or APIs on Cloudflare

**Probably not needed for this project** unless building web interface.

### OpenZeppelinStellarContracts
**Purpose:** Generate Stellar smart contract templates

**Key operations:**
- `stellar-fungible` - Generate fungible token (SEP-41)
- `stellar-stablecoin` - Generate stablecoin contract
- `stellar-non-fungible` - Generate NFT (SEP-50)

**Use for:**
- Reference implementations
- Understanding Stellar token standards
- Template for custom tokens

**Probably not needed** - we're using existing BLND/USDC tokens.

### playwright / chrome-devtools
**Purpose:** Browser automation and testing

**Use for:**
- Testing web UIs
- E2E testing
- Screenshot capture

**Not needed** for smart contract development.

## Tool Selection Guide

### For researching Soroban/Stellar patterns:
1. **github** - Read source of fee-vault-v2, soroswap, soroban-examples
2. **rust-docs** - Understand soroban-sdk and dependency APIs
3. **deepwiki** - Ask questions about specific repos
4. **WebSearch** - Find latest best practices and discussions

### For understanding dependencies:
1. **rust-docs** - Primary tool for crate documentation
2. **github** - View source and tests
3. **deepwiki** - High-level documentation

### For finding patterns/examples:
1. **Explore agent** - Search through multiple repos
2. **github search_code** - Find specific code patterns
3. **WebSearch** - Find tutorials and blog posts

### For complex research:
1. **General Purpose agent** - Multi-step research tasks
2. Combines multiple MCP tools automatically

## Recommended Workflow

### Phase 1: Understanding Dependencies
```
1. rust-docs: cache_crate_from_cratesio("soroban-sdk", "23.1.0")
2. rust-docs: cache_crate_from_cratesio("soroban-fixed-point-math", "1.3.0")
3. rust-docs: structure("soroban-sdk", "23.1.0") to understand layout
4. github: get_file_contents("script3", "fee-vault-v2", "README.md")
5. github: get_file_contents("soroswap", "core", "README.md")
```

### Phase 2: Studying Integration Patterns
```
1. Explore agent: "Find how fee-vault-v2 handles deposits" (medium thoroughness)
2. github: get_file_contents("script3", "fee-vault-v2", "src/vault.rs")
3. rust-docs: search_items_preview("soroban-sdk", "23.1.0", "token")
4. deepwiki: ask_question("script3/fee-vault-v2", "What are the key integration points?")
```

### Phase 3: Implementing Features
```
1. rust-docs: search_items_preview to find specific methods
2. rust-docs: get_item_details for full documentation
3. rust-docs: get_item_source to see example usage
4. github search_code: "soroban-sdk Map insert example"
```

### Phase 4: Problem Solving
```
1. WebSearch: "Soroban [specific error or pattern]"
2. Explore agent: "Find examples of [pattern] in soroban-examples"
3. General Purpose agent: "Research solutions for [complex problem]"
```

## Quick Reference

| Task | Primary Tool | Secondary Tool |
|------|-------------|----------------|
| Understand soroban-sdk API | rust-docs | github |
| Study fee-vault-v2 | github | deepwiki |
| Find code patterns | Explore agent | github search_code |
| Latest best practices | WebSearch | WebFetch |
| Complex research | General Purpose agent | - |
| Multi-file code search | Explore agent | - |
| Crate documentation | rust-docs | - |
| Specific questions | deepwiki | - |

## Key Repos to Reference

- **soroban-sdk**: Core Soroban SDK
- **soroban-examples**: Official examples
- **fee-vault-v2**: `script3/fee-vault-v2` - Vault integration patterns
- **Soroswap**: `soroswap/core` - DEX integration
- **soroban-fixed-point-math**: `script3/soroban-fixed-point-math` - Safe math

## Rust/Soroban/Stellar Best Practices

### No_std Requirements
```rust
#![no_std]

// Use Soroban SDK types
use soroban_sdk::{contract, contractimpl, Address, Env, Map, Vec, Symbol, BytesN};

// DON'T use std types
// ❌ std::vec::Vec
// ❌ std::collections::HashMap
// ❌ String
```

### Symbol for Storage Keys
```rust
// ✅ Good - efficient
const CONFIG: Symbol = symbol_short!("CONFIG");
const ADMIN: Symbol = symbol_short!("ADMIN");

// ❌ Bad - expensive
const KEY: &str = "my_config_key";
```

### References to Avoid Cloning
```rust
// ✅ Good - pass reference
fn helper(env: &Env, player: &Address) {
    // use without cloning
}

// ❌ Bad - unnecessary clone
fn helper(env: Env, player: Address) {
    // env and player are cloned
}
```

### Fixed-Point Math
```rust
use soroban_fixed_point_math::FixedPoint;

const SCALAR_7: i128 = 10_000_000; // 7 decimals

// ✅ Good - safe, checked math
let result = amount
    .fixed_mul_floor(multiplier, SCALAR_7)
    .expect("overflow");

// ❌ Bad - can overflow silently
let result = (amount * multiplier) / SCALAR_7;
```

### Storage Patterns
```rust
// ✅ Good - type-safe, collision-free
pub enum DataKey {
    Player(Address),
    EpochPlayer(u32, Address),
    Epoch(u32),
    Session(BytesN<32>),
}

let key = DataKey::Player(user_addr);
env.storage().persistent().get(&key);
```

### Error Handling
```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotAdmin = 1,
    InsufficientBalance = 10,
    InvalidAmount = 12,
}

// Usage
if amount <= 0 {
    return Err(Error::InvalidAmount);
}
```

### Event Emissions
```rust
// Emit events for off-chain indexing
env.events().publish(
    (symbol_short!("deposit"), player),
    (amount, new_balance)
);
```

### Cross-Contract Calls
```rust
// Define external contract client
use soroban_sdk::contractclient;

#[contractclient(name = "FeeVaultClient")]
pub trait FeeVaultTrait {
    fn deposit(env: Env, player: Address, amount: i128) -> i128;
}

// Use it
let vault_client = FeeVaultClient::new(&env, &vault_address);
vault_client.deposit(&player, &amount);
```

## TypeScript Testing with Bun

### Setup
```bash
# Install Bun (fast JavaScript runtime)
curl -fsSL https://bun.sh/install | bash

# Initialize project
bun init

# Install dependencies
bun add @stellar/stellar-sdk
bun add -d @types/node
```

### Package.json
```json
{
  "name": "blendizzard-tests",
  "type": "module",
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch"
  },
  "dependencies": {
    "@stellar/stellar-sdk": "^12.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "bun-types": "latest"
  }
}
```

### Stellar TypeScript SDK

**Installation:**
```bash
bun add @stellar/stellar-sdk
```

**Basic usage:**
```typescript
import * as StellarSdk from '@stellar/stellar-sdk';

// Connect to network
const server = new StellarSdk.SorobanRpc.Server(
  'https://soroban-testnet.stellar.org'
);

// Load account
const account = await server.getAccount(publicKey);

// Build transaction
const transaction = new StellarSdk.TransactionBuilder(account, {
  fee: StellarSdk.BASE_FEE,
  networkPassphrase: StellarSdk.Networks.TESTNET
})
  .addOperation(/* ... */)
  .setTimeout(30)
  .build();
```

### Stellar Contract Bindings (TypeScript)

**Generate bindings from contract:**
```bash
# Build contract first (uses wasm32v1-none automatically)
cd contracts/blendizzard
stellar contract build

# Generate TypeScript bindings
stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/blendizzard.wasm \
  --output-dir ../../bindings/blendizzard \
  --contract-id <CONTRACT_ID>
```

**Using generated bindings:**
```typescript
import { Contract, networks } from './bindings/blendizzard';
import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';

// Initialize client
const keypair = Keypair.fromSecret('SECRET_KEY');
const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');

const contract = new Contract({
  contractId: 'CONTRACT_ID',
  networkPassphrase: networks.testnet.networkPassphrase,
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// Call contract methods (type-safe!)
const result = await contract.deposit({
  player: keypair.publicKey(),
  amount: BigInt(1000_0000000), // 1000 USDC (7 decimals)
});

console.log('Deposit result:', result);
```

### Test Structure with Bun

**test/setup.ts:**
```typescript
import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';

export const server = new SorobanRpc.Server(
  'https://soroban-testnet.stellar.org'
);

export const admin = Keypair.fromSecret(process.env.ADMIN_SECRET!);
export const user1 = Keypair.fromSecret(process.env.USER1_SECRET!);
export const user2 = Keypair.fromSecret(process.env.USER2_SECRET!);

export const CONTRACT_ID = process.env.CONTRACT_ID!;
```

**test/deposit.test.ts:**
```typescript
import { expect, test, describe } from 'bun:test';
import { Contract } from '../bindings/blendizzard';
import { admin, user1, server, CONTRACT_ID } from './setup';

describe('Deposit', () => {
  const contract = new Contract({
    contractId: CONTRACT_ID,
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
  });

  test('should deposit USDC', async () => {
    const amount = BigInt(100_0000000); // 100 USDC

    const result = await contract.deposit({
      player: user1.publicKey(),
      amount,
    });

    expect(result).toBeDefined();

    // Verify balance
    const player = await contract.get_player({
      player: user1.publicKey(),
    });

    expect(player.total_deposited).toBe(amount);
  });

  test('should track deposit timestamp', async () => {
    const beforeTime = Math.floor(Date.now() / 1000);

    await contract.deposit({
      player: user1.publicKey(),
      amount: BigInt(50_0000000),
    });

    const afterTime = Math.floor(Date.now() / 1000);

    const player = await contract.get_player({
      player: user1.publicKey(),
    });

    // Timestamp should be between before and after
    expect(Number(player.deposit_timestamp)).toBeGreaterThanOrEqual(beforeTime);
    expect(Number(player.deposit_timestamp)).toBeLessThanOrEqual(afterTime);
  });
});
```

**test/game.test.ts:**
```typescript
import { expect, test, describe, beforeAll } from 'bun:test';
import { Contract } from '../bindings/blendizzard';
import { admin, user1, user2, CONTRACT_ID } from './setup';

describe('Game Lifecycle', () => {
  const contract = new Contract({
    contractId: CONTRACT_ID,
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://soroban-testnet.stellar.org',
  });

  beforeAll(async () => {
    // Setup: deposit for both players
    await contract.deposit({
      player: user1.publicKey(),
      amount: BigInt(1000_0000000),
    });

    await contract.deposit({
      player: user2.publicKey(),
      amount: BigInt(1000_0000000),
    });

    // Select factions
    await contract.select_faction({
      player: user1.publicKey(),
      faction: 0, // WholeNoodle
    });

    await contract.select_faction({
      player: user2.publicKey(),
      faction: 1, // PointyStick
    });
  });

  test('should start game and lock fp', async () => {
    const sessionId = crypto.randomUUID();
    const gameId = 'GAME_CONTRACT_ID';

    await contract.start_game({
      game_id: gameId,
      session_id: Buffer.from(sessionId).toString('hex'),
      player1: user1.publicKey(),
      player2: user2.publicKey(),
      player1_wager: BigInt(100_0000000),
      player2_wager: BigInt(100_0000000),
    });

    // Check fp locked
    const player1Data = await contract.get_epoch_player({
      player: user1.publicKey(),
    });

    expect(player1Data.locked_fp).toBe(BigInt(100_0000000));
  });

  test('should end game and distribute fp', async () => {
    const sessionId = crypto.randomUUID();
    // ... test game end logic
  });
});
```

**Run tests:**
```bash
# Run all tests
bun test

# Run specific test file
bun test test/deposit.test.ts

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

### Integration Testing Flow

**Important:** Use `wasm32v1-none` target for Soroban contracts (Rust 1.84.0+).

1. **Install target (one-time setup):**
   ```bash
   rustup target add wasm32v1-none
   ```

2. **Build contract:**
   ```bash
   cd contracts/blendizzard
   stellar contract build
   # Output: target/wasm32v1-none/release/blendizzard.wasm
   ```

3. **Deploy to testnet:**
   ```bash
   stellar contract deploy \
     --wasm target/wasm32v1-none/release/blendizzard.wasm \
     --source admin \
     --network testnet
   ```

4. **Generate TypeScript bindings:**
   ```bash
   stellar contract bindings typescript \
     --wasm target/wasm32v1-none/release/blendizzard.wasm \
     --output-dir ../../bindings/blendizzard \
     --contract-id <CONTRACT_ID>
   ```

5. **Run tests:**
   ```bash
   cd ../..
   bun test
   ```

**Why wasm32v1-none?**
- Official Stellar recommendation as of 2025
- Locks to WebAssembly 1.0 (stable, no breaking changes)
- Prevents Safari/browser compatibility issues
- `stellar contract build` uses this automatically

### Environment Variables

**.env:**
```bash
# Network
NETWORK=testnet
RPC_URL=https://soroban-testnet.stellar.org

# Accounts (use stellar CLI to generate)
ADMIN_SECRET=S...
USER1_SECRET=S...
USER2_SECRET=S...

# Contracts
CONTRACT_ID=C...
FEE_VAULT_ID=C...
SOROSWAP_ROUTER_ID=C...
BLND_TOKEN_ID=C...
USDC_TOKEN_ID=C...
```

**Load in tests:**
```typescript
import { config } from 'dotenv';
config();
```

## Notes

- Default to local tools (`rg`, `cargo test`, docs on disk) before escalating to agents; it keeps the fast feedback loop tight.
- Always cache crates before using rust-docs search
- Use Explore agent for multi-file searches (more efficient than manual)
- Use github search_code for finding specific patterns across repos
- Use WebSearch for latest information and troubleshooting
- General Purpose agent can combine multiple tools automatically
- Use Bun for fast TypeScript tests (faster than Node.js)
- Regenerate TypeScript bindings after contract changes
- Use type-safe contract bindings instead of manual transaction building
