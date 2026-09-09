import { ethers } from "ethers";

export interface CustodialWallet {
  address: string;
  privateKey: string;
}

/**
 * Generate a real Ethereum-compatible wallet for Monad Testnet.
 * Private key is stored server-side only (ADR-002).
 * User never sees wallet address or private key.
 */
export function generateCustodialWallet(): CustodialWallet {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}
