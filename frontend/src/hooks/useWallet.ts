import { useCallback } from 'react';
import { useWalletStore } from '@/store/walletSlice';
import * as freighterApi from '@stellar/freighter-api';
import { devWalletService, DevWalletService } from '@/services/devWalletService';
import { NETWORK, NETWORK_PASSPHRASE } from '@/utils/constants';
import type { ContractSigner } from '@/types/signer';

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
   * Connect to Freighter wallet
   */
  const connect = useCallback(async () => {
    try {
      setConnecting(true);
      setError(null);

      // Check if Freighter is installed
      const { isConnected: freighterInstalled } = await freighterApi.isConnected();
      if (!freighterInstalled) {
        throw new Error('Freighter wallet is not installed');
      }

      // Request access to user's public key
      const { address, error: accessError } = await freighterApi.requestAccess();
      if (accessError) {
        throw new Error(accessError.message || 'Failed to connect to Freighter');
      }

      // Update store with wallet details
      setWallet(address, 'freighter', 'wallet');
      setNetwork(NETWORK, NETWORK_PASSPHRASE);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to Freighter';
      setError(errorMessage);
      console.error('Freighter connection error:', err);
      throw err;
    } finally {
      setConnecting(false);
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

        // Update store with dev wallet
        setWallet(address, `dev-player${playerNumber}`, 'dev');
        setNetwork(NETWORK, NETWORK_PASSPHRASE);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to connect dev wallet';
        setError(errorMessage);
        console.error('Dev wallet connection error:', err);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [setWallet, setConnecting, setNetwork, setError]
  );

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async () => {
    if (walletType === 'dev') {
      devWalletService.disconnect();
    }
    storeDisconnect();
  }, [walletType, storeDisconnect]);

  /**
   * Get a signer for contract interactions
   * Returns functions that the Stellar SDK TS bindings can use for signing
   */
  const getContractSigner = useCallback((): ContractSigner => {
    if (!isConnected || !publicKey || !walletType) {
      throw new Error('Wallet not connected');
    }

    if (walletType === 'dev') {
      // Dev wallet uses the dev wallet service's signer
      return devWalletService.getSigner();
    } else {
      // Freighter wallet signer
      return {
        signTransaction: async (xdr: string, opts?: {
          networkPassphrase?: string;
          address?: string;
          submit?: boolean;
          submitUrl?: string;
        }) => {
          const signingAddress = opts?.address || publicKey;
          console.log('signTransaction with address:', signingAddress);

          const result = await freighterApi.signTransaction(xdr, {
            networkPassphrase: opts?.networkPassphrase || NETWORK_PASSPHRASE,
            address: signingAddress,
          });

          // Return result in the format expected by Stellar SDK
          return result;
        },
        signAuthEntry: async (authEntry: string, opts?: {
          networkPassphrase?: string;
          address?: string;
        }) => {
          const signingAddress = opts?.address || publicKey;
          console.log('signAuthEntry with address:', signingAddress);

          const { signedAuthEntry, signerAddress, error } = await freighterApi.signAuthEntry(authEntry, {
            networkPassphrase: opts?.networkPassphrase || NETWORK_PASSPHRASE,
            address: signingAddress,
          });

          // Return result in the format expected by Stellar SDK
          // Convert null to empty string and ensure it's a string type
          return {
            signedAuthEntry: (signedAuthEntry || '') as string,
            signerAddress,
            error,
          };
        },
      };
    }
  }, [isConnected, publicKey, walletType]);

  /**
   * Check if dev mode is available
   */
  const isDevModeAvailable = useCallback(() => {
    return DevWalletService.isDevModeAvailable();
  }, []);

  /**
   * Check if a specific dev player is available
   */
  const isDevPlayerAvailable = useCallback((playerNumber: 1 | 2) => {
    return DevWalletService.isPlayerAvailable(playerNumber);
  }, []);

  /**
   * Get the install link for Freighter extension
   */
  const getInstallLink = useCallback(() => {
    return 'https://www.freighter.app/';
  }, []);

  /**
   * Check if Freighter is installed
   */
  const checkFreighterInstalled = useCallback(async () => {
    const { isConnected: installed } = await freighterApi.isConnected();
    return installed;
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
    getContractSigner,
    isDevModeAvailable,
    isDevPlayerAvailable,
    getInstallLink,
    checkFreighterInstalled,
  };
}
