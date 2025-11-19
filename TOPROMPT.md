* update frontend to use the Frieghter wallet or Wallet Kit I guess vs using the hard coded dev wallets
    * Stretch goal will be to use smart wallets
    * BIG stretch use the OZ smart wallet interface
* add Launchtube as the tx submission endpoint
    * Stretch add OZ Relayer 
* update epochs to per-hour

MAYBE
* Consider having loser fp added to winners faction_fp
* Consider having loser fp added to winners available_fp

SOMEDAY
* Review "Smooth Piecewise Multiplier System (Cubic Hermite Splines)". It's likely a bit expensive. The start_game function costs 0.05 XLM. Seems like we could bring that down a bit
* Add a feature in the fee-vault-v2 to deposit on behalf of another user (would make the claim_epoch_reward method cheaper)