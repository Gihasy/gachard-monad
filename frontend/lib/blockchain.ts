import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL?.trim()!;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS?.trim()!;
console.log("[blockchain] CONTRACT_ADDRESS:", CONTRACT_ADDRESS);
console.log("[blockchain] RPC_URL:", RPC_URL);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// ABI minimal untuk fungsi yang dibutuhkan
const GACHARD_ABI = [
  "function mintCard(address to, uint8 rarity) external returns (uint256 tokenId)",
  "function mintBatch(address to, uint8[] calldata rarities) external returns (uint256[] memory tokenIds)",
  "function requestPrint(uint256 tokenId, bytes32 redeemHash, address ownerAddress) external",
  "function redeemCard(uint256 tokenId, bytes32 redeemHash, address recipientAddress) external",
  "function marketplaceTransfer(uint256 tokenId, address from, address to) external",
  "function cardStatus(uint256 tokenId) external view returns (uint8)",
  "function cardRarity(uint256 tokenId) external view returns (uint8)",
  "function storedHash(uint256 tokenId) external view returns (bytes32)",
  "function lastOwner(uint256 tokenId) external view returns (address)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "event CardMinted(uint256 indexed tokenId, address indexed to, uint8 status, uint8 rarity)",
  "event CardStatusChanged(uint256 indexed tokenId, uint8 oldStatus, uint8 newStatus)",
  "event MarketplaceTransfer(uint256 indexed tokenId, address indexed from, address indexed to)",
  "function recordVerification(uint256 tokenId, uint8 riskScore, bool flagged) external",
  "function lastRiskScore(uint256 tokenId) external view returns (uint8)",
  "function flaggedSuspicious(uint256 tokenId) external view returns (bool)",
  "event VerificationRecorded(uint256 indexed tokenId, uint8 riskScore, bool flagged)",
  "function burnCard(uint256 tokenId, address owner) external",
  "event CardBurned(uint256 indexed tokenId, address indexed owner, uint8 rarity)",
];

/**
 * Retry wrapper for blockchain calls.
 * Retries up to MAX_RETRIES times with exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`[blockchain] ${label} attempt ${attempt}/${MAX_RETRIES} failed:`, (error as Error).message);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw new Error(`[blockchain] ${label} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

export function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

export function getAdminWallet() {
  const provider = getProvider();
  const privateKey = process.env.ADMIN_PRIVATE_KEY?.trim()!;
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error(`Invalid ADMIN_PRIVATE_KEY format`);
  }
  return new ethers.Wallet(privateKey, provider);
}

export function getContract(signer?: ethers.Signer) {
  const s = signer || getAdminWallet();
  if (!CONTRACT_ADDRESS || !ethers.isAddress(CONTRACT_ADDRESS)) {
    throw new Error(`Invalid CONTRACT_ADDRESS: "${CONTRACT_ADDRESS}"`);
  }
  return new ethers.Contract(CONTRACT_ADDRESS, GACHARD_ABI, s);
}

export async function mintCard(toAddress: string, rarity: number): Promise<string> {
  // Validate and normalize address to prevent ENS resolution
  const normalizedAddress = ethers.getAddress(toAddress);
  const contract = getContract();
  const tx = await contract.mintCard(normalizedAddress, rarity);
  return tx.hash;
}

export async function mintBatch(toAddress: string, rarities: number[]): Promise<string> {
  console.log("[blockchain] mintBatch called with address:", toAddress);
  
  // Validate address format
  if (!toAddress || typeof toAddress !== 'string') {
    throw new Error(`Invalid address: ${toAddress}`);
  }
  
  // Ensure address is properly formatted (0x + 40 hex chars)
  const cleanAddress = toAddress.trim().replace(/[\r\n]/g, '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(cleanAddress)) {
    throw new Error(`Address format invalid: "${cleanAddress}" (length: ${cleanAddress.length})`);
  }
  
  // Use getAddress to checksum the address
  const checksummedAddress = ethers.getAddress(cleanAddress);
  console.log("[blockchain] Checksummed address:", checksummedAddress);
  
  const contract = getContract();
  console.log("[blockchain] Contract address:", CONTRACT_ADDRESS);
  
  // Use staticCall to test the call without sending a transaction
  try {
    console.log("[blockchain] Testing mintBatch with staticCall...");
    await contract.mintBatch.staticCall(checksummedAddress, rarities);
    console.log("[blockchain] staticCall succeeded");
  } catch (error) {
    console.error("[blockchain] staticCall failed:", error);
    throw error;
  }
  
  // If staticCall succeeds, send the actual transaction
  console.log("[blockchain] Sending actual transaction...");
  const tx = await contract.mintBatch(checksummedAddress, rarities);
  console.log("[blockchain] Transaction hash:", tx.hash);
  
  return tx.hash;
}

/**
 * Poll for transaction receipt with retries and exponential backoff.
 * Returns receipt if confirmed, or null if still pending after all retries.
 */
export async function waitForReceipt(
  txHash: string,
  maxRetries = 6,
  baseDelayMs = 1500
): Promise<ethers.TransactionReceipt | null> {
  const provider = getProvider();
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
    } catch {
      // Provider error — retry
    }
    await new Promise((r) => setTimeout(r, baseDelayMs));
  }
  return null;
}

export async function requestPrint(tokenId: number, redeemHash: string, ownerAddress: string): Promise<string> {
  const contract = getContract();
  const tx = await contract.requestPrint(tokenId, redeemHash, ownerAddress);
  return tx.hash;
}

export async function redeemCard(tokenId: number, redeemHash: string, recipientAddress: string): Promise<string> {
  const contract = getContract();
  const tx = await contract.redeemCard(tokenId, redeemHash, recipientAddress);
  return tx.hash;
}

export async function getCardStatus(tokenId: number): Promise<number> {
  return withRetry(async () => {
    const contract = getContract();
    return contract.cardStatus(tokenId);
  }, `cardStatus(${tokenId})`);
}

export async function getCardRarity(tokenId: number): Promise<number> {
  return withRetry(async () => {
    const contract = getContract();
    return contract.cardRarity(tokenId);
  }, `cardRarity(${tokenId})`);
}

export async function getStoredHash(tokenId: number): Promise<string> {
  return withRetry(async () => {
    const contract = getContract();
    return contract.storedHash(tokenId);
  }, `storedHash(${tokenId})`);
}

export async function getLastOwner(tokenId: number): Promise<string> {
  return withRetry(async () => {
    const contract = getContract();
    return contract.lastOwner(tokenId);
  }, `lastOwner(${tokenId})`);
}

export async function marketplaceTransfer(tokenId: number, fromAddress: string, toAddress: string): Promise<string> {
  const contract = getContract();
  const tx = await contract.marketplaceTransfer(tokenId, fromAddress, toAddress);
  return tx.hash;
}

export async function recordVerification(tokenId: number, riskScore: number, flagged: boolean): Promise<string> {
  const contract = getContract();
  const tx = await contract.recordVerification(tokenId, riskScore, flagged);
  return tx.hash;
}

export async function getBalance(address: string, tokenId: number): Promise<bigint> {
  return withRetry(async () => {
    const contract = getContract();
    return contract.balanceOf(address, tokenId);
  }, `balanceOf(${address}, ${tokenId})`);
}

export async function burnCard(tokenId: number, ownerAddress: string): Promise<string> {
  const contract = getContract();
  const tx = await contract.burnCard(tokenId, ownerAddress);
  return tx.hash;
}
