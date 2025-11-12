use soroban_sdk::{contracttype, Address, Env};

use crate::types::{
    Config, EpochInfo, EpochPlayer, EpochPlayerV0, GameSession, Player, PlayerV0, PlayerV1,
};

// ============================================================================
// Storage Keys
// ============================================================================
// Uses type-safe enum keys to prevent storage collisions and improve type safety
//
// Storage Types:
// - Instance: Admin, Config, CurrentEpoch, Paused
// - Persistent: Player, Game
// - Temporary: EpochPlayer, Epoch, Session, Claimed

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Admin address - singleton (Instance storage)
    Admin,

    /// Global configuration - singleton (Instance storage)
    Config,

    /// Current epoch number - singleton (Instance storage)
    CurrentEpoch,

    /// Pause state - singleton (Instance storage)
    Paused,

    /// OLD - Player persistent data (for migration only - DO NOT USE)
    /// This variant exists only to support migration from old storage keys
    #[deprecated]
    User(Address),

    /// Player persistent data - Player(player_address) -> Player (Persistent storage)
    Player(Address),

    /// OLD - Player epoch-specific data (for migration only - DO NOT USE)
    /// This variant exists only to support migration from old storage keys
    #[deprecated]
    EpochUser(u32, Address),

    /// Player epoch-specific data - EpochPlayer(epoch_number, player_address) -> EpochPlayer (Temporary storage)
    EpochPlayer(u32, Address),

    /// Epoch metadata - Epoch(epoch_number) -> EpochInfo (Temporary storage)
    Epoch(u32),

    /// Game session data - Session(session_id) -> GameSession (Temporary storage)
    Session(u32),

    /// Whitelisted game contracts - Game(game_address) -> bool (Persistent storage)
    Game(Address),

    /// Reward claim tracking - Claimed(player_address, epoch_number) -> bool (Temporary storage)
    Claimed(Address, u32),
}

// ============================================================================
// Storage Utilities
// ============================================================================

/// Check if the contract has been initialized
pub(crate) fn is_initialized(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

/// Get the admin address
pub(crate) fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("Admin not set")
}

/// Set the admin address
pub(crate) fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
}

/// Get the global configuration
pub(crate) fn get_config(env: &Env) -> Config {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("Config not set")
}

/// Set the global configuration
pub(crate) fn set_config(env: &Env, config: &Config) {
    env.storage().instance().set(&DataKey::Config, config);
}

/// Get the current epoch number
pub(crate) fn get_current_epoch(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::CurrentEpoch)
        .unwrap_or(0)
}

/// Set the current epoch number
pub(crate) fn set_current_epoch(env: &Env, epoch: u32) {
    env.storage().instance().set(&DataKey::CurrentEpoch, &epoch);
}

/// Get player persistent data
pub(crate) fn get_player(env: &Env, player: &Address) -> Option<Player> {
    let key = DataKey::Player(player.clone());
    let result = env.storage().persistent().get(&key);
    if result.is_some() {
        extend_player_ttl(env, player);
    }
    result
}

/// Set player persistent data
pub(crate) fn set_player(env: &Env, player: &Address, data: &Player) {
    env.storage()
        .persistent()
        .set(&DataKey::Player(player.clone()), data);
    extend_player_ttl(env, player);
}

/// Migrate player data from old formats to current format
///
/// Handles migration from:
/// - Old storage key (DataKey::Player) to new key (DataKey::Player)
/// - V0 (pre-Nov 10): selected_faction, total_deposited, deposit_timestamp
/// - V1 (Nov 10-12): selected_faction, deposit_timestamp, last_epoch_balance
/// - V2 (current): selected_faction, time_multiplier_start, last_epoch_balance
///
/// This reads old storage keys and struct formats, deletes them, and writes back the current format.
/// Returns true if migration was performed, false if player doesn't exist or is already migrated.
pub(crate) fn migrate_player_storage(env: &Env, player: &Address) -> bool {
    let new_key = DataKey::Player(player.clone());
    let old_key = DataKey::User(player.clone());

    // Try to read as current format (V2) with new key first
    if let Some(_) = get_player(env, player) {
        // Already in new format with new key, no migration needed
        return false;
    }

    // Try to read from old key as V1 format (deposit_timestamp + last_epoch_balance)
    let v1_data: Option<PlayerV1> = env.storage().persistent().get(&old_key);
    if let Some(old) = v1_data {
        // Convert V1 to V2
        let new_data = Player {
            selected_faction: old.selected_faction,
            time_multiplier_start: old.deposit_timestamp, // Field rename
            last_epoch_balance: old.last_epoch_balance,
        };

        // Delete old key
        env.storage().persistent().remove(&old_key);

        // Write back with new key and format
        set_player(env, player, &new_data);
        return true;
    }

    // Try to read from old key as V0 format (total_deposited + deposit_timestamp)
    let v0_data: Option<PlayerV0> = env.storage().persistent().get(&old_key);
    if let Some(old) = v0_data {
        // Convert V0 to V2
        let new_data = Player {
            selected_faction: old.selected_faction,
            time_multiplier_start: old.deposit_timestamp, // Field rename
            last_epoch_balance: 0, // V0 didn't track this, set to 0 (no previous epoch)
        };

        // Delete old key
        env.storage().persistent().remove(&old_key);

        // Write back with new key and format
        set_player(env, player, &new_data);
        return true;
    }

    // Try to read from new key as V2 format but check if it needs schema fix
    // This handles the edge case where key was already migrated but schema wasn't
    let new_key_v1: Option<PlayerV1> = env.storage().persistent().get(&new_key);
    if let Some(old) = new_key_v1 {
        let new_data = Player {
            selected_faction: old.selected_faction,
            time_multiplier_start: old.deposit_timestamp,
            last_epoch_balance: old.last_epoch_balance,
        };
        env.storage().persistent().remove(&new_key);
        set_player(env, player, &new_data);
        return true;
    }

    // Player doesn't exist in any format
    false
}

/// Migrate epoch-specific player data from old storage key to new one
///
/// Handles migration from:
/// - Old storage key (DataKey::EpochUser) to new key (DataKey::EpochPlayer)
/// - V0 (pre-Nov 13): EpochPlayer with locked_fp field
/// - V1 (current): EpochPlayer without locked_fp field
///
/// Returns true if migration was performed, false if already migrated or doesn't exist.
pub(crate) fn migrate_epoch_player_storage(env: &Env, epoch: u32, player: &Address) -> bool {
    let new_key = DataKey::EpochPlayer(epoch, player.clone());
    let old_key = DataKey::EpochUser(epoch, player.clone());

    // Check if already migrated to new format (exists in new key with new format)
    let new_format_check: Option<EpochPlayer> = env.storage().temporary().get(&new_key);
    if new_format_check.is_some() {
        return false;
    }

    // Try to read from old key as V0 format (with locked_fp)
    let v0_data: Option<EpochPlayerV0> = env.storage().temporary().get(&old_key);
    if let Some(old) = v0_data {
        // Convert V0 to V1 (drop locked_fp field)
        let new_data = EpochPlayer {
            epoch_faction: old.epoch_faction,
            epoch_balance_snapshot: old.epoch_balance_snapshot,
            available_fp: old.available_fp,
            total_fp_contributed: old.total_fp_contributed,
        };

        // Write to new key
        env.storage().temporary().set(&new_key, &new_data);
        extend_epoch_player_ttl(env, epoch, player);

        // Delete old key
        env.storage().temporary().remove(&old_key);

        return true;
    }

    // Try to read from new key as V0 format (with locked_fp) - in case it was partially migrated
    let v0_new_key_data: Option<EpochPlayerV0> = env.storage().temporary().get(&new_key);
    if let Some(old) = v0_new_key_data {
        // Convert V0 to V1 (drop locked_fp field)
        let new_data = EpochPlayer {
            epoch_faction: old.epoch_faction,
            epoch_balance_snapshot: old.epoch_balance_snapshot,
            available_fp: old.available_fp,
            total_fp_contributed: old.total_fp_contributed,
        };

        // Overwrite with new format
        env.storage().temporary().set(&new_key, &new_data);
        extend_epoch_player_ttl(env, epoch, player);

        return true;
    }

    // Data doesn't exist in either key or format
    false
}

/// Check if player exists
#[allow(dead_code)]
pub(crate) fn has_player(env: &Env, player: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Player(player.clone()))
}

/// Get epoch-specific player data
pub(crate) fn get_epoch_player(env: &Env, epoch: u32, player: &Address) -> Option<EpochPlayer> {
    let new_key = DataKey::EpochPlayer(epoch, player.clone());

    // Try new key with new format (V1 - without locked_fp)
    let result: Option<EpochPlayer> = env.storage().temporary().get(&new_key);
    if result.is_some() {
        extend_epoch_player_ttl(env, epoch, player);
        return result;
    }

    // Try old key (DataKey::EpochUser) with V0 format (with locked_fp)
    let old_key = DataKey::EpochUser(epoch, player.clone());
    let v0_result: Option<EpochPlayerV0> = env.storage().temporary().get(&old_key);
    if let Some(v0_data) = v0_result {
        extend_epoch_player_ttl(env, epoch, player);
        // Convert on the fly (drop locked_fp)
        return Some(EpochPlayer {
            epoch_faction: v0_data.epoch_faction,
            epoch_balance_snapshot: v0_data.epoch_balance_snapshot,
            available_fp: v0_data.available_fp,
            total_fp_contributed: v0_data.total_fp_contributed,
        });
    }

    None
}

/// Set epoch-specific player data
pub(crate) fn set_epoch_player(env: &Env, epoch: u32, player: &Address, data: &EpochPlayer) {
    let key = DataKey::EpochPlayer(epoch, player.clone());
    env.storage().temporary().set(&key, data);
    extend_epoch_player_ttl(env, epoch, player);
}

/// Check if epoch player exists
pub(crate) fn has_epoch_player(env: &Env, epoch: u32, player: &Address) -> bool {
    env.storage()
        .temporary()
        .has(&DataKey::EpochPlayer(epoch, player.clone()))
}

/// Get epoch metadata
pub(crate) fn get_epoch(env: &Env, epoch: u32) -> Option<EpochInfo> {
    let key = DataKey::Epoch(epoch);
    let result = env.storage().temporary().get(&key);
    if result.is_some() {
        extend_epoch_ttl(env, epoch);
    }
    result
}

/// Set epoch metadata
pub(crate) fn set_epoch(env: &Env, epoch: u32, data: &EpochInfo) {
    let key = DataKey::Epoch(epoch);
    env.storage().temporary().set(&key, data);
    extend_epoch_ttl(env, epoch);
}

/// Get game session
pub(crate) fn get_session(env: &Env, session_id: u32) -> Option<GameSession> {
    let key = DataKey::Session(session_id);
    let result = env.storage().temporary().get(&key);
    if result.is_some() {
        extend_session_ttl(env, session_id);
    }
    result
}

/// Set game session
pub(crate) fn set_session(env: &Env, session_id: u32, data: &GameSession) {
    let key = DataKey::Session(session_id);
    env.storage().temporary().set(&key, data);
    extend_session_ttl(env, session_id);
}

/// Check if session exists
pub(crate) fn has_session(env: &Env, session_id: u32) -> bool {
    env.storage().temporary().has(&DataKey::Session(session_id))
}

/// Check if a game contract is whitelisted
pub(crate) fn is_game_whitelisted(env: &Env, game_id: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Game(game_id.clone()))
        .unwrap_or(false)
}

/// Add a game to the whitelist
pub(crate) fn add_game_to_whitelist(env: &Env, game_id: &Address) {
    env.storage()
        .persistent()
        .set(&DataKey::Game(game_id.clone()), &true);
}

/// Remove a game from the whitelist
pub(crate) fn remove_game_from_whitelist(env: &Env, game_id: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::Game(game_id.clone()));
}

/// Check if player has claimed rewards for an epoch
pub(crate) fn has_claimed(env: &Env, player: &Address, epoch: u32) -> bool {
    let key = DataKey::Claimed(player.clone(), epoch);
    let result: Option<bool> = env.storage().temporary().get(&key);
    if let Some(true) = result {
        extend_claimed_ttl(env, player, epoch);
        true
    } else {
        false
    }
}

/// Mark rewards as claimed for player and epoch
pub(crate) fn set_claimed(env: &Env, player: &Address, epoch: u32) {
    let key = DataKey::Claimed(player.clone(), epoch);
    env.storage().temporary().set(&key, &true);
    extend_claimed_ttl(env, player, epoch);
}

// ============================================================================
// Storage TTL Management
// ============================================================================
// TTL (Time To Live) management ensures data doesn't expire unexpectedly
// Based on Soroban best practices:
// - Instance storage: Tied to contract lifetime (Admin, Config, CurrentEpoch, Paused)
// - Persistent storage: Cross-epoch data (Player, Game whitelist) - extends to 30 days when accessed
// - Temporary storage: Epoch-specific data (EpochPlayer, Epoch, Claimed, Session) - 30 days from last interaction
//
// Storage Type Summary:
// - Instance: Config-type variables that persist for contract lifetime
// - Persistent: Player data and game whitelist that must survive across epochs
// - Temporary: Epoch-specific data that expires 30 days after last access

/// TTL thresholds and extensions (in ledgers, ~5 seconds per ledger)
/// ~30 days = 518,400 ledgers
/// ~7 days = 120,960 ledgers
const TTL_THRESHOLD_LEDGERS: u32 = 120_960; // Extend if < 7 days remaining
const TTL_EXTEND_TO_LEDGERS: u32 = 518_400; // Extend to 30 days

/// Extend TTL for player data
/// Should be called whenever player data is read/written
pub(crate) fn extend_player_ttl(env: &Env, player: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Player(player.clone()),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for epoch player data (temporary storage)
/// Should be called whenever epoch player data is read/written
pub(crate) fn extend_epoch_player_ttl(env: &Env, epoch: u32, player: &Address) {
    env.storage().temporary().extend_ttl(
        &DataKey::EpochPlayer(epoch, player.clone()),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for epoch data (temporary storage)
/// Should be called whenever epoch data is read/written
pub(crate) fn extend_epoch_ttl(env: &Env, epoch: u32) {
    env.storage().temporary().extend_ttl(
        &DataKey::Epoch(epoch),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for claimed rewards data (temporary storage)
/// Should be called whenever claim data is written
pub(crate) fn extend_claimed_ttl(env: &Env, player: &Address, epoch: u32) {
    env.storage().temporary().extend_ttl(
        &DataKey::Claimed(player.clone(), epoch),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for game session data (temporary storage)
/// Should be called whenever session data is read/written
pub(crate) fn extend_session_ttl(env: &Env, session_id: u32) {
    env.storage().temporary().extend_ttl(
        &DataKey::Session(session_id),
        TTL_THRESHOLD_LEDGERS,
        TTL_EXTEND_TO_LEDGERS,
    );
}

/// Extend TTL for instance storage (contract-wide data)
/// Should be called during initialization and periodically
pub(crate) fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD_LEDGERS, TTL_EXTEND_TO_LEDGERS);
}

// ============================================================================
// Emergency Pause Management
// ============================================================================

/// Check if the contract is paused
pub(crate) fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false) // Default to not paused if not set
}

/// Set pause state
pub(crate) fn set_pause_state(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
}

/// Check if contract is not paused, return error if paused
/// Call this at the start of all player-facing functions
pub(crate) fn require_not_paused(env: &Env) -> Result<(), crate::errors::Error> {
    if is_paused(env) {
        Err(crate::errors::Error::ContractPaused)
    } else {
        Ok(())
    }
}
