import { useEffect, useCallback } from 'react';
import { useWalletStore } from '@/store/walletSlice';
import { walletService } from '@/services/walletService';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import { getSigner } from '@/utils/signerHelper';

export function useWallet() {
  const {
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,
    setWallet,
    setConnecting,
    setNetwork,
    setError,
    disconnect: storeDisconnect,
  } = useWalletStore();

  /**
   * Attempt to reconnect wallet on mount (if session exists)
   */
  useEffect(() => {
    const reconnect = async () => {
      if (publicKey && walletId && walletType === 'wallet') {
        try {
          // Try to reconnect with the saved wallet ID
          const address = await walletService.connectWithWalletId(walletId);

          // Verify the address matches (wallet might have switched accounts)
          if (address !== publicKey) {
            console.warn('Wallet address changed, updating store');
            setWallet(address, walletId, 'wallet');
          }

          const { network: net, networkPassphrase: pass } = walletService.getNetwork();
          setNetwork(net, pass);
        } catch (err) {
          console.warn('Failed to reconnect wallet, clearing session:', err);
          storeDisconnect();
        }
      } else if (publicKey && walletType === 'dev') {
        // Dev wallet doesn't need reconnection, just verify it's still valid
        try {
          devWalletService.getPublicKey();
        } catch (err) {
          console.warn('Dev wallet session invalid, clearing:', err);
          storeDisconnect();
        }
      }
    };

    reconnect();
  }, []); // Only run on mount

  /**
   * Connect to a wallet using the modal
   */
  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);

      const details = await walletService.openModal();

      // Update store with wallet details
      setWallet(details.address, details.walletId, 'wallet');
      setNetwork(details.network, details.networkPassphrase);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      console.error('Wallet connection error:', err);
      throw err;
    }
  }, [setWallet, setConnecting, setNetwork, setError]);

  /**
   * Connect as a dev player (for testing)
   */
  const connectDev = useCallback(
    async (playerNumber: 1 | 2) => {
      try {
        setConnecting(true);
        setError(null);

        devWalletService.initPlayer(playerNumber);
        const address = devWalletService.getPublicKey();

        // Get network from wallet service
        const { network: net, networkPassphrase: pass } = walletService.getNetwork();

        // Update store
        setWallet(address, `dev-player${playerNumber}`, 'dev');
        setNetwork(net, pass);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect dev wallet';
        setError(errorMessage);
        console.error('Dev wallet connection error:', err);
        throw err;
      }
    },
    [setWallet, setConnecting, setNetwork, setError]
  );

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    if (walletType === 'wallet') {
      await walletService.disconnect();
    } else if (walletType === 'dev') {
      devWalletService.disconnect();
    }
    storeDisconnect();
  }, [walletType, storeDisconnect]);

  /**
   * Get a signer for contract interactions
   */
  const getContractSigner = useCallback(() => {
    if (!isConnected || !publicKey || !walletType) {
      throw new Error('Wallet not connected');
    }

    return getSigner(walletType, publicKey);
  }, [isConnected, publicKey, walletType]);

  /**
   * Sign a transaction (direct method for backward compatibility)
   * Returns { signedTxXdr: string; signerAddress?: string; error?: WalletError }
   */
  const signTransaction = useCallback(
    async (xdr: string) => {
      if (!isConnected || !publicKey || !walletType) {
        throw new Error('Wallet not connected');
      }

      try {
        if (walletType === 'dev') {
          return await devWalletService.signTransaction(xdr);
        } else {
          return await walletService.signTransaction(xdr, { address: publicKey });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction';
        setError(errorMessage);
        throw err;
      }
    },
    [isConnected, publicKey, walletType, setError]
  );

  /**
   * Check if dev mode is available
   */
  const isDevModeAvailable = useCallback(() => {
    return DevWalletService.isDevModeAvailable();
  }, []);

  return {
    // State
    publicKey,
    walletId,
    walletType,
    isConnected,
    isConnecting,
    network,
    networkPassphrase,
    error,

    // Actions
    connect,
    connectDev,
    disconnect,
    signTransaction,
    getContractSigner,
    isDevModeAvailable,
  };
}
