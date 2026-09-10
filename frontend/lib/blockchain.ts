import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL?.trim()!;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS?.trim()!;
console.log("[blockchain] CONTRACT_ADDRESS:", CONTRACT_ADDRESS);
console.log("[blockchain] RPC_URL:", RPC_URL);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Nonce manager to prevent nonce collisions with concurrent transactions
let currentNonce: number | null = null;
let nonceLock = false;

async function acquireNonce(provider: ethers.JsonRpcProvider, address: string): Promise<number> {
  // Wait for lock to release
  while (nonceLock) {
    await new Promise(r => setTimeout(r, 50));
  }
  nonceLock = true;
  try {
    if (currentNonce === null) {
      currentNonce = await provider.getTransactionCount(address, "pending");
    }
    const nonce = currentNonce;
    currentNonce++;
    return nonce;
  } finally {
    nonceLock = false;
  }
}

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
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
  
  // Acquire nonce to prevent collision with concurrent transactions
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.mintCard(normalizedAddress, rarity, { nonce });
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
  
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
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
  
  // Acquire nonce to prevent collision with concurrent transactions
  const nonce = await acquireNonce(provider, wallet.address);
  console.log("[blockchain] Using nonce:", nonce);
  
  // If staticCall succeeds, send the actual transaction with explicit nonce
  console.log("[blockchain] Sending actual transaction...");
  const tx = await contract.mintBatch(checksummedAddress, rarities, { nonce });
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
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.requestPrint(tokenId, redeemHash, ownerAddress, { nonce });
  return tx.hash;
}

export async function redeemCard(tokenId: number, redeemHash: string, recipientAddress: string): Promise<string> {
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.redeemCard(tokenId, redeemHash, recipientAddress, { nonce });
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
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.marketplaceTransfer(tokenId, fromAddress, toAddress, { nonce });
  return tx.hash;
}

export async function recordVerification(tokenId: number, riskScore: number, flagged: boolean): Promise<string> {
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.recordVerification(tokenId, riskScore, flagged, { nonce });
  return tx.hash;
}

export async function getBalance(address: string, tokenId: number): Promise<bigint> {
  return withRetry(async () => {
    const contract = getContract();
    return contract.balanceOf(address, tokenId);
  }, `balanceOf(${address}, ${tokenId})`);
}

export async function burnCard(tokenId: number, ownerAddress: string): Promise<string> {
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.burnCard(tokenId, ownerAddress, { nonce });
  return tx.hash;
}

// ==================== PackEntropy functions ====================

const PACK_ENTROPY_ABI = [
  "function requestPack(uint256 packId, address userAddr, uint8 packSize, uint8 guaranteed) external returns (uint64 sequenceNumber)",
  "function fulfillPack(uint64 sequenceNumber, address userAddr, uint8[] calldata rarities) external",
  "function getSeed(uint64 sequenceNumber) external view returns (bytes32)",
  "function getRarityHash(uint64 sequenceNumber) external view returns (bytes32)",
  "function getBalance() external view returns (uint256)",
  "event PackRequested(uint64 indexed sequenceNumber, address indexed userAddr, uint8 packSize, uint8 guaranteed)",
  "event PackFulfilled(uint64 indexed sequenceNumber, address indexed userAddr, bytes32 rarityHash)",
];

function getPackEntropyContract(signer?: ethers.Signer) {
  const entropyAddress = process.env.ENTROPY_CONTRACT_ADDRESS?.trim();
  if (!entropyAddress || !ethers.isAddress(entropyAddress)) {
    throw new Error(`Invalid ENTROPY_CONTRACT_ADDRESS: "${entropyAddress}"`);
  }
  const s = signer || getAdminWallet();
  return new ethers.Contract(entropyAddress, PACK_ENTROPY_ABI, s);
}

export async function requestPackEntropy(
  packId: number,
  userAddr: string,
  packSize: number,
  guaranteed: number
): Promise<{ sequenceNumber: number; txHash: string }> {
  const normalizedAddress = ethers.getAddress(userAddr);
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getPackEntropyContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.requestPack(packId, normalizedAddress, packSize, guaranteed, { nonce });
  const receipt = await waitForReceipt(tx.hash, 15, 1000);
  if (!receipt) throw new Error("No receipt for requestPack tx");

  // Extract sequenceNumber from PackRequested event
  const PACK_REQUESTED_TOPIC = ethers.id("PackRequested(uint64,address,uint8,uint8)");
  for (const log of receipt.logs) {
    if (log.topics[0] === PACK_REQUESTED_TOPIC) {
      const sequenceNumber = parseInt(log.topics[1], 16);
      return { sequenceNumber, txHash: tx.hash };
    }
  }
  throw new Error("PackRequested event not found in receipt");
}

export async function fulfillPackEntropy(
  sequenceNumber: number,
  userAddr: string,
  rarities: number[]
): Promise<string> {
  const normalizedAddress = ethers.getAddress(userAddr);
  const provider = getProvider();
  const wallet = getAdminWallet().connect(provider);
  const contract = getPackEntropyContract(wallet);
  const nonce = await acquireNonce(provider, wallet.address);
  const tx = await contract.fulfillPack(sequenceNumber, normalizedAddress, rarities, { nonce });
  return tx.hash;
}

export async function getEntropySeed(sequenceNumber: number): Promise<string> {
  return withRetry(async () => {
    const contract = getPackEntropyContract();
    return contract.getSeed(sequenceNumber);
  }, `getSeed(${sequenceNumber})`);
}

export async function getEntropyRarityHash(sequenceNumber: number): Promise<string> {
  return withRetry(async () => {
    const contract = getPackEntropyContract();
    return contract.getRarityHash(sequenceNumber);
  }, `getRarityHash(${sequenceNumber})`);
}

export async function getEntropyBalance(): Promise<bigint> {
  return withRetry(async () => {
    const contract = getPackEntropyContract();
    return contract.getBalance();
  }, "getEntropyBalance");
}
