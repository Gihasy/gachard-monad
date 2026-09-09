/**
 * Seed marketplace demo data — REAL on-chain transactions with txHash.
 * Run: cd frontend && npx tsx scripts/seed-marketplace.ts
 *
 * Every "sold" transaction executes marketplaceTransfer() on-chain
 * and records the real txHash.
 */

import { MongoClient, ObjectId } from "mongodb";
import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Read .env.local manually
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
}

const MONGODB_URL = env.MONGODB_URL || process.env.MONGODB_URL || "";
const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS || "";
const RPC_URL = env.RPC_URL || process.env.RPC_URL || "";
const PRIVATE_KEY = env.ADMIN_PRIVATE_KEY || process.env.ADMIN_PRIVATE_KEY || "";

// Minimal ABI for seed operations
const ABI = [
  "function mintCard(address to, uint8 rarity) external returns (uint256 tokenId)",
  "function marketplaceTransfer(uint256 tokenId, address from, address to) external",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function nextTokenId() external view returns (uint256)",
];

const PRICE_RANGES: Record<number, { min: number; max: number; count: [number, number] }> = {
  0: { min: 50, max: 150, count: [6, 7] },
  1: { min: 200, max: 500, count: [5, 6] },
  2: { min: 600, max: 1200, count: [3, 4] },
  3: { min: 1500, max: 3000, count: [2, 3] },
};

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(min: number, max: number) {
  return Math.round(randomInt(min, max) / 10) * 10;
}

function pastDate(daysAgo: number, jitterDays = 3) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo + randomInt(-jitterDays, jitterDays));
  d.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59));
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = any;

async function mintCard(contract: ethers.Contract, toAddress: string, rarity: number): Promise<number> {
  const tx = await contract.mintCard(toAddress, rarity);
  const receipt = await tx.wait();
  // Parse tokenId from CardMinted event
  const log = receipt.logs.find((l: ethers.Log) => {
    try {
      const parsed = contract.interface.parseLog(l);
      return parsed?.name === "CardMinted";
    } catch { return false; }
  });
  if (!log) throw new Error("CardMinted event not found");
  const parsed = contract.interface.parseLog(log);
  return Number(parsed!.args[0]);
}

async function transferCard(contract: ethers.Contract, tokenId: number, from: string, to: string): Promise<string> {
  const tx = await contract.marketplaceTransfer(tokenId, from, to);
  const receipt = await tx.wait();
  return receipt.hash;
}

async function seed() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  console.log(`Admin wallet: ${wallet.address}`);
  console.log(`Contract: ${CONTRACT_ADDRESS}`);

  const client = new MongoClient(MONGODB_URL);
  await client.connect();
  const db = client.db();

  const usersCol = db.collection("users");
  const cardsCol = db.collection("cards");
  const txCol = db.collection("transactions");

  // Get existing demo users
  const users = await usersCol.find({}).toArray();
  if (users.length < 6) {
    console.error("Need at least 6 demo users. Found:", users.length);
    process.exit(1);
  }
  console.log(`Found ${users.length} users`);

  // Clear existing sold transactions
  const deleteResult = await txCol.deleteMany({ type: "sold" });
  console.log(`Deleted ${deleteResult.deletedCount} existing sold transactions`);

  const transactions: AnyDoc[] = [];

  // === OWNERSHIP CHAINS (3 cards with multiple trades, REAL on-chain) ===
  const chainConfigs = [
    { rarity: 3, trades: 5, basePrice: 2000, variance: 300, label: "Legendary" },
    { rarity: 2, trades: 4, basePrice: 900, variance: 200, label: "Epic" },
    { rarity: 1, trades: 3, basePrice: 350, variance: 100, label: "Rare" },
  ];

  const usedTokenIds = new Set<number>();

  for (const chain of chainConfigs) {
    const chainUsers = users.slice(0, chain.trades + 1);

    // Mint card to first user in chain
    const tokenId = await mintCard(contract, chainUsers[0].walletAddress, chain.rarity);
    usedTokenIds.add(tokenId);
    console.log(`Minted tokenId ${tokenId} (${chain.label}) to ${chainUsers[0].username}`);

    // Update MongoDB card record
    await cardsCol.updateOne(
      { tokenId },
      { $set: { ownerAddress: chainUsers[0].walletAddress, status: "Digital", updatedAt: new Date().toISOString() } }
    );

    let price = chain.basePrice;

    for (let i = 0; i < chain.trades; i++) {
      price = Math.max(50, price + randomInt(-chain.variance, chain.variance));
      price = Math.round(price / 10) * 10;

      const fromUser = chainUsers[i];
      const toUser = chainUsers[i + 1];

      // Execute REAL on-chain transfer
      const txHash = await transferCard(contract, tokenId, fromUser.walletAddress, toUser.walletAddress);
      console.log(`  Transfer ${tokenId}: ${fromUser.username} → ${toUser.username} | txHash=${txHash.slice(0, 18)}...`);

      transactions.push({
        _id: new ObjectId(),
        userId: toUser._id.toString(),
        type: "sold",
        tokenId,
        tokenIds: [tokenId],
        rarity: chain.rarity,
        rarities: [chain.rarity],
        templateIds: [`template-${chain.label.toLowerCase()}`],
        amount: price,
        purchasePrice: price,
        txHash,
        status: "confirmed",
        contractAddress: CONTRACT_ADDRESS,
        fromAddress: fromUser.walletAddress,
        toAddress: toUser.walletAddress,
        error: "",
        createdAt: pastDate(21 - i * 2),
        updatedAt: pastDate(21 - i * 2),
      });
    }

    // Update card owner to final buyer
    const finalOwner = chainUsers[chain.trades];
    await cardsCol.updateOne(
      { tokenId },
      { $set: { ownerAddress: finalOwner.walletAddress, updatedAt: new Date().toISOString() } }
    );
    console.log(`  Card ${tokenId} final owner: ${finalOwner.username}`);
  }

  // === INDEPENDENT SOLD TRANSACTIONS (1 trade per card, REAL on-chain) ===
  for (const [rarityStr, config] of Object.entries(PRICE_RANGES)) {
    const rarity = parseInt(rarityStr);
    const count = randomInt(config.count[0], config.count[1]);

    for (let i = 0; i < count; i++) {
      const sellerIdx = randomInt(0, users.length - 1);
      let buyerIdx = randomInt(0, users.length - 1);
      while (buyerIdx === sellerIdx) buyerIdx = randomInt(0, users.length - 1);

      const seller = users[sellerIdx];
      const buyer = users[buyerIdx];
      const price = randomPrice(config.min, config.max);

      // Mint to seller, then transfer to buyer
      const tokenId = await mintCard(contract, seller.walletAddress, rarity);
      usedTokenIds.add(tokenId);
      const txHash = await transferCard(contract, tokenId, seller.walletAddress, buyer.walletAddress);
      console.log(`Independent ${["Common", "Rare", "Epic", "Legendary"][rarity]}: tokenId ${tokenId} | ${seller.username} → ${buyer.username} | txHash=${txHash.slice(0, 18)}...`);

      // Update MongoDB card
      await cardsCol.updateOne(
        { tokenId },
        { $set: { ownerAddress: buyer.walletAddress, status: "Digital", updatedAt: new Date().toISOString() } }
      );

      transactions.push({
        _id: new ObjectId(),
        userId: buyer._id.toString(),
        type: "sold",
        tokenId,
        tokenIds: [tokenId],
        rarity,
        rarities: [rarity],
        templateIds: [`template-r${rarity}`],
        amount: price,
        purchasePrice: price,
        txHash,
        status: "confirmed",
        contractAddress: CONTRACT_ADDRESS,
        fromAddress: seller.walletAddress,
        toAddress: buyer.walletAddress,
        error: "",
        createdAt: pastDate(21 - i * 3),
        updatedAt: pastDate(21 - i * 3),
      });
    }
    console.log(`Independent: ${count} ${["Common", "Rare", "Epic", "Legendary"][rarity]} transactions`);
  }

  // === WASH-TRADING DEMO CASE (3 rapid trades, REAL on-chain) ===
  const washUserA = users[0];
  const washUserB = users[1];
  const washPrices = [300, 600, 1200];
  const washRiskScores = [45, 72, 92];

  // Mint wash-trading card to user A
  const washTokenId = await mintCard(contract, washUserA.walletAddress, 1);
  console.log(`Wash-trading: minted tokenId ${washTokenId} (Rare) to ${washUserA.username}`);

  await cardsCol.updateOne(
    { tokenId: washTokenId },
    { $set: { ownerAddress: washUserA.walletAddress, status: "Digital", updatedAt: new Date().toISOString() } }
  );

  for (let i = 0; i < 3; i++) {
    const fromUser = i % 2 === 0 ? washUserA : washUserB;
    const toUser = i % 2 === 0 ? washUserB : washUserA;

    const txHash = await transferCard(contract, washTokenId, fromUser.walletAddress, toUser.walletAddress);
    console.log(`  Wash trade ${i + 1}: ${fromUser.username} → ${toUser.username} | price=${washPrices[i]} | txHash=${txHash.slice(0, 18)}...`);

    transactions.push({
      _id: new ObjectId(),
      userId: toUser._id.toString(),
      type: "sold",
      tokenId: washTokenId,
      tokenIds: [washTokenId],
      rarity: 1,
      rarities: [1],
      templateIds: ["template-rare"],
      amount: washPrices[i],
      purchasePrice: washPrices[i],
      txHash,
      status: "confirmed",
      contractAddress: CONTRACT_ADDRESS,
      fromAddress: fromUser.walletAddress,
      toAddress: toUser.walletAddress,
      error: "",
      createdAt: pastDate(5 - i),
      updatedAt: pastDate(5 - i),
      riskScore: washRiskScores[i],
      flagged: washRiskScores[i] >= 70,
      riskReasoning: washRiskScores[i] >= 70
        ? "Pola wash-trading terdeteksi: pasangan wallet yang sama berulang kali dengan harga meningkat tajam"
        : "Transaksi awal dalam pola yang baru terbentuk",
    });
  }

  // Update wash card final owner
  await cardsCol.updateOne(
    { tokenId: washTokenId },
    { $set: { ownerAddress: washUserB.walletAddress, updatedAt: new Date().toISOString() } }
  );

  // Insert all transactions
  if (transactions.length > 0) {
    await txCol.insertMany(transactions);
  }

  console.log(`\nSeeded ${transactions.length} sold transactions — ALL with real on-chain txHash`);
  await client.close();
}

seed().catch(console.error);
