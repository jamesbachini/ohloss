/**
 * Blendizzard Service - Read-only contract data access
 *
 * NOTE: This file intentionally avoids `.simulate()` for common reads.
 * Simulation is convenient but can trigger multiple RPC requests per call.
 *
 * Instead, we directly fetch contract storage entries using getLedgerEntries,
 * and batch requests where possible.
 */

import { rpc, xdr, Address, scValToNative } from '@stellar/stellar-sdk'

// Configuration from environment
const BLENDIZZARD_CONTRACT = import.meta.env.VITE_BLENDIZZARD_CONTRACT || ''
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://rpc.lightsail.network'

const { Server: RpcServer } = rpc

let rpcInstance: InstanceType<typeof RpcServer> | null = null
function getRpc(): InstanceType<typeof RpcServer> {
  if (!rpcInstance) {
    rpcInstance = new RpcServer(RPC_URL)
  }
  return rpcInstance
}

// =============================================================================
// Storage key helpers
// =============================================================================

function buildPlayerKey(playerAddress: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Player'),
    new Address(playerAddress).toScVal(),
  ])
}

function buildEpochPlayerKey(epoch: number, playerAddress: string): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('EpochPlayer'),
    xdr.ScVal.scvU32(epoch),
    new Address(playerAddress).toScVal(),
  ])
}

function storageKeyToLedgerKey(
  contractId: string,
  key: xdr.ScVal,
  durability: 'temporary' | 'persistent' | 'instance' = 'temporary'
): xdr.LedgerKey {
  const contractAddress = new Address(contractId)

  if (durability === 'instance') {
    return xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: contractAddress.toScAddress(),
        key: xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      })
    )
  }

  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: contractAddress.toScAddress(),
      key,
      durability:
        durability === 'persistent'
          ? xdr.ContractDataDurability.persistent()
          : xdr.ContractDataDurability.temporary(),
    })
  )
}

// =============================================================================
// Current epoch (cached)
// =============================================================================

const CURRENT_EPOCH_CACHE_TTL_MS = 10_000
let currentEpochCache: { epoch: number; fetchedAtMs: number } | null = null

function parseCurrentEpochFromInstance(data: xdr.LedgerEntryData): number | null {
  try {
    const contractData = data.contractData()
    const instance = contractData.val().instance()
    const storage = instance.storage()

    if (!storage) return null

    for (const item of storage) {
      const key = item.key()
      const val = item.val()

      if (key.switch().name === 'scvVec') {
        const vec = key.vec()
        if (vec && vec.length > 0 && vec[0].switch().name === 'scvSymbol') {
          const symbol = vec[0].sym().toString()
          if (symbol === 'CurrentEpoch') {
            return scValToNative(val) as number
          }
        }
      }
    }

    return null
  } catch (err) {
    console.error('[parseCurrentEpochFromInstance] Error:', err)
    return null
  }
}

/**
 * Get current epoch by reading contract instance storage.
 * Cached briefly to avoid duplicate calls during initial app load.
 */
export async function getCurrentEpoch(): Promise<number> {
  if (!BLENDIZZARD_CONTRACT) return 0

  const now = Date.now()
  if (currentEpochCache && now - currentEpochCache.fetchedAtMs < CURRENT_EPOCH_CACHE_TTL_MS) {
    return currentEpochCache.epoch
  }

  try {
    const rpcClient = getRpc()
    // Note: key param is ignored for instance durability in storageKeyToLedgerKey
    const instanceLedgerKey = storageKeyToLedgerKey(BLENDIZZARD_CONTRACT, xdr.ScVal.scvU32(0), 'instance')
    const response = await rpcClient.getLedgerEntries(instanceLedgerKey)

    const entry0 = response.entries?.[0]
    if (!entry0) return 0

    const epoch = parseCurrentEpochFromInstance(entry0.val) ?? 0
    currentEpochCache = { epoch, fetchedAtMs: now }
    return epoch
  } catch (err) {
    console.error('[getCurrentEpoch] Error:', err)
    return 0
  }
}

/**
 * Get player's available FP for the current epoch.
 * Reads EpochPlayer from contract storage instead of simulating.
 */
export async function getAvailableFp(playerAddress: string): Promise<bigint> {
  if (!BLENDIZZARD_CONTRACT) return 100_0000000n

  try {
    const rpcClient = getRpc()
    const epoch = await getCurrentEpoch()

    const epochPlayerKey = buildEpochPlayerKey(epoch, playerAddress)
    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      epochPlayerKey,
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(epochPlayerLedgerKey)
    const entry0 = response.entries?.[0]

    if (!entry0) {
      // Not found => player hasn't initialized for this epoch yet
      return 100_0000000n
    }

    const native = scValToNative(entry0.val.contractData().val()) as any
    if (native && native.available_fp !== undefined && native.available_fp !== null) {
      return BigInt(native.available_fp)
    }

    return 100_0000000n
  } catch (err) {
    console.error('[getAvailableFp] Error:', err)
    return 100_0000000n
  }
}

/**
 * Get full epoch player data from contract storage.
 * Returns the parsed native object (snake_case keys), or null if missing.
 */
export async function getEpochPlayer(playerAddress: string, epoch?: number) {
  if (!BLENDIZZARD_CONTRACT) return null

  try {
    const rpcClient = getRpc()
    const currentEpoch = epoch ?? await getCurrentEpoch()

    const epochPlayerKey = buildEpochPlayerKey(currentEpoch, playerAddress)
    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      epochPlayerKey,
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(epochPlayerLedgerKey)
    const entry0 = response.entries?.[0]
    if (!entry0) return null

    return scValToNative(entry0.val.contractData().val())
  } catch (err) {
    console.error('[getEpochPlayer] Error:', err)
    return null
  }
}

/**
 * Check if player has selected a faction.
 * Reads the Player entry from contract storage instead of simulating.
 */
export async function hasFactionSelected(playerAddress: string): Promise<boolean> {
  if (!BLENDIZZARD_CONTRACT) return false

  try {
    const rpcClient = getRpc()

    const playerKey = buildPlayerKey(playerAddress)
    const playerLedgerKey = storageKeyToLedgerKey(BLENDIZZARD_CONTRACT, playerKey, 'persistent')

    const response = await rpcClient.getLedgerEntries(playerLedgerKey)
    const entry0 = response.entries?.[0]

    // No ledger entry => player does not exist => no faction selected
    return !!entry0
  } catch (err) {
    console.error('[hasFactionSelected] Error:', err)
    return false
  }
}

/**
 * Convenience method for the lobby: fetch faction status + current epoch + available FP
 * with (at most) 2 RPC calls.
 */
export async function getLobbyPlayerData(playerAddress: string): Promise<{
  hasFaction: boolean
  epoch: number
  availableFp: bigint
}> {
  const epoch = await getCurrentEpoch()

  if (!BLENDIZZARD_CONTRACT) {
    return { hasFaction: false, epoch, availableFp: 100_0000000n }
  }

  try {
    const rpcClient = getRpc()

    const playerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      buildPlayerKey(playerAddress),
      'persistent'
    )

    const epochPlayerLedgerKey = storageKeyToLedgerKey(
      BLENDIZZARD_CONTRACT,
      buildEpochPlayerKey(epoch, playerAddress),
      'temporary'
    )

    const response = await rpcClient.getLedgerEntries(playerLedgerKey, epochPlayerLedgerKey)

    const playerEntry = response.entries?.[0]
    const epochPlayerEntry = response.entries?.[1]

    const hasFaction = !!playerEntry

    let availableFp = 100_0000000n
    if (epochPlayerEntry) {
      try {
        const native = scValToNative(epochPlayerEntry.val.contractData().val()) as any
        if (native && native.available_fp !== undefined && native.available_fp !== null) {
          availableFp = BigInt(native.available_fp)
        }
      } catch (err) {
        console.warn('[getLobbyPlayerData] Failed to parse epoch player data:', err)
      }
    }

    return { hasFaction, epoch, availableFp }
  } catch (err) {
    console.error('[getLobbyPlayerData] Error:', err)
    return { hasFaction: false, epoch, availableFp: 100_0000000n }
  }
}
