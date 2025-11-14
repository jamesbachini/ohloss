* Have FP be a multiple of 100. So 1 USDC to 100 FP and then multipliers. Also do some math and calculations on multipliers to ensure we’re in a good place
* Ensure we're testing for specific error codes in the way that Stellar is designed for by reviewing fee-vault-v2, blend/core, and soroswap/core contracts to see how they test for specific contract codes. Make a helper if it's helpful to ensure you're appropriately catching and matching not just generic "did error" but asserting on specific error types

MAYBE
* Consider having loser fp added to winners faction_fp
* Consider having loser fp added to winners available_fp

TODO
* Update number-guess and blendizzard