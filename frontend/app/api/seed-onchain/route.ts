import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { ethers } from "ethers";

export const maxDuration = 60;

const ABI = [
  "function mintCard(address to, uint8 rarity) external returns (uint256 tokenId)",
  "function marketplaceTransfer(uint256 tokenId, address from, address to) external",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "event CardMinted(uint256 indexed tokenId, address indexed to, uint8 status, uint8 rarity)",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pastDate(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randomInt(8, 22), randomInt(0, 59), randomInt(0, 59));
  return d.toISOString();
}

async function mintCard(contract: ethers.Contract, to: string, rarity: number): Promise<number> {
  const tx = await contract.mintCard(to, rarity);
  const receipt = await tx.wait();
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "CardMinted") return Number(parsed.args[0]);
    } catch { /* not our event */ }
  }
  throw new Error("CardMinted event not found");
}

async function transferCard(contract: ethers.Contract, tokenId: number, from: string, to: string): Promise<string> {
  const tx = await contract.marketplaceTransfer(tokenId, from, to);
  const receipt = await tx.wait();
  return receipt.hash;
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const batch = searchParams.get("batch") || "all";
    if (token !== process.env.ENCRYPTION_SECRET_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
    const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, wallet);

    const usersCol = await getCollection("users");
    const cardsCol = await getCollection("cards");
    const txCol = await getCollection("transactions");

    const users = await usersCol.find({}).toArray();
    if (users.length < 6) {
      return NextResponse.json({ error: `Need 6+ users, found ${users.length}` }, { status: 400 });
    }

    if (batch === "clear") {
      const r = await txCol.deleteMany({ type: "sold" });
      return NextResponse.json({ success: true, deleted: r.deletedCount, batch: "clear" });
    }

    const transactions: Record<string, unknown>[] = [];
    const log: string[] = [];

    if (batch === "wash" || batch === "all") {
      // Clear old sold first
      if (batch === "all") await txCol.deleteMany({ type: "sold" });

      const washA = users[0];
      const washB = users[1];
      const washId = await mintCard(contract, washA.walletAddress, 1);
      log.push(`Wash: minted tokenId ${washId} to ${washA.username}`);
      const washPrices = [300, 600, 1200];
      const washScores = [45, 72, 92];
      for (let i = 0; i < 3; i++) {
        const from = i % 2 === 0 ? washA : washB;
        const to = i % 2 === 0 ? washB : washA;
        const hash = await transferCard(contract, washId, from.walletAddress, to.walletAddress);
        log.push(`  Wash ${i + 1}: ${from.username} → ${to.username} | ${washPrices[i]}C | ${hash.slice(0, 16)}...`);
        transactions.push({ _id: new ObjectId(), userId: to._id.toString(), type: "sold", tokenId: washId, tokenIds: [washId], rarity: 1, rarities: [1], templateIds: ["template-rare"], amount: washPrices[i], purchasePrice: washPrices[i], txHash: hash, status: "confirmed", contractAddress: process.env.CONTRACT_ADDRESS, fromAddress: from.walletAddress, toAddress: to.walletAddress, error: "", createdAt: pastDate(5 - i), updatedAt: pastDate(5 - i), riskScore: washScores[i], flagged: washScores[i] >= 70, riskReasoning: washScores[i] >= 70 ? "Pola wash-trading terdeteksi: pasangan wallet yang sama berulang kali dengan harga meningkat tajam" : "Transaksi awal dalam pola yang baru terbentuk" });
      }
      await cardsCol.updateOne({ tokenId: washId }, { $set: { ownerAddress: washB.walletAddress, status: "Digital", updatedAt: new Date().toISOString() } });
    }

    if (batch === "chain1" || batch === "all") {
      const chainUsers = users.slice(0, 6);
      const c1Id = await mintCard(contract, chainUsers[0].walletAddress, 3);
      log.push(`Chain1: minted Legendary tokenId ${c1Id}`);
      let price = 2000;
      for (let i = 0; i < 5; i++) {
        price = Math.max(500, price + randomInt(-300, 300));
        price = Math.round(price / 10) * 10;
        const hash = await transferCard(contract, c1Id, chainUsers[i].walletAddress, chainUsers[i + 1].walletAddress);
        log.push(`  ${chainUsers[i].username} → ${chainUsers[i + 1].username} | ${price}C`);
        transactions.push({ _id: new ObjectId(), userId: chainUsers[i + 1]._id.toString(), type: "sold", tokenId: c1Id, tokenIds: [c1Id], rarity: 3, rarities: [3], templateIds: ["template-legendary"], amount: price, purchasePrice: price, txHash: hash, status: "confirmed", contractAddress: process.env.CONTRACT_ADDRESS, fromAddress: chainUsers[i].walletAddress, toAddress: chainUsers[i + 1].walletAddress, error: "", createdAt: pastDate(21 - i * 2), updatedAt: pastDate(21 - i * 2) });
      }
      await cardsCol.updateOne({ tokenId: c1Id }, { $set: { ownerAddress: chainUsers[5].walletAddress, status: "Digital", updatedAt: new Date().toISOString() } });
    }

    if (batch === "chain2" || batch === "all") {
      const chainUsers = users.slice(0, 5);
      const c2Id = await mintCard(contract, chainUsers[0].walletAddress, 2);
      log.push(`Chain2: minted Epic tokenId ${c2Id}`);
      let price = 900;
      for (let i = 0; i < 4; i++) {
        price = Math.max(200, price + randomInt(-200, 200));
        price = Math.round(price / 10) * 10;
        const hash = await transferCard(contract, c2Id, chainUsers[i].walletAddress, chainUsers[i + 1].walletAddress);
        log.push(`  ${chainUsers[i].username} → ${chainUsers[i + 1].username} | ${price}C`);
        transactions.push({ _id: new ObjectId(), userId: chainUsers[i + 1]._id.toString(), type: "sold", tokenId: c2Id, tokenIds: [c2Id], rarity: 2, rarities: [2], templateIds: ["template-epic"], amount: price, purchasePrice: price, txHash: hash, status: "confirmed", contractAddress: process.env.CONTRACT_ADDRESS, fromAddress: chainUsers[i].walletAddress, toAddress: chainUsers[i + 1].walletAddress, error: "", createdAt: pastDate(18 - i * 2), updatedAt: pastDate(18 - i * 2) });
      }
      await cardsCol.updateOne({ tokenId: c2Id }, { $set: { ownerAddress: chainUsers[4].walletAddress, status: "Digital", updatedAt: new Date().toISOString() } });
    }

    if (batch === "chain3" || batch === "all") {
      const chainUsers = users.slice(0, 4);
      const c3Id = await mintCard(contract, chainUsers[0].walletAddress, 1);
      log.push(`Chain3: minted Rare tokenId ${c3Id}`);
      let price = 350;
      for (let i = 0; i < 3; i++) {
        price = Math.max(100, price + randomInt(-100, 100));
        price = Math.round(price / 10) * 10;
        const hash = await transferCard(contract, c3Id, chainUsers[i].walletAddress, chainUsers[i + 1].walletAddress);
        log.push(`  ${chainUsers[i].username} → ${chainUsers[i + 1].username} | ${price}C`);
        transactions.push({ _id: new ObjectId(), userId: chainUsers[i + 1]._id.toString(), type: "sold", tokenId: c3Id, tokenIds: [c3Id], rarity: 1, rarities: [1], templateIds: ["template-rare"], amount: price, purchasePrice: price, txHash: hash, status: "confirmed", contractAddress: process.env.CONTRACT_ADDRESS, fromAddress: chainUsers[i].walletAddress, toAddress: chainUsers[i + 1].walletAddress, error: "", createdAt: pastDate(15 - i * 2), updatedAt: pastDate(15 - i * 2) });
      }
      await cardsCol.updateOne({ tokenId: c3Id }, { $set: { ownerAddress: chainUsers[3].walletAddress, status: "Digital", updatedAt: new Date().toISOString() } });
    }

    if (transactions.length > 0) {
      await txCol.insertMany(transactions);
    }

    return NextResponse.json({
      success: true,
      batch,
      seeded: transactions.length,
      allHaveTxHash: transactions.every((t) => t.txHash !== null),
      log,
    });
  } catch (error) {
    console.error("[seed-onchain]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
