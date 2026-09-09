import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const maxDuration = 15;
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { mintBatch, waitForReceipt } from "@/lib/blockchain";
import { buildPackRarities } from "@/lib/odds";
import { pickCardTemplate, seedCardTemplates, updateArtworkUrls } from "@/lib/card-templates";
import { deductCredits, addCredits } from "@/lib/credits";
import { generateInvoiceId } from "@/lib/invoice";
import { friendlyTxStatus } from "@/lib/status-map";
import { ethers } from "ethers";

/** Background confirm: poll receipt and update cards/tokenIds */
async function confirmMint(txHash: string, txId: string, contractAddress: string) {
  try {
    const cleanContractAddress = contractAddress.trim().toLowerCase();
    console.log("[confirmMint] Starting for tx:", txHash, "txId:", txId, "contract:", cleanContractAddress);
    
    // Poll with shorter intervals since client is also polling
    const receipt = await waitForReceipt(txHash, 15, 1000);
    if (!receipt) {
      console.error("[confirmMint] No receipt found for tx:", txHash);
      return;
    }
    if (receipt.status !== 1) {
      console.error("[confirmMint] Transaction failed on-chain. Status:", receipt.status);
      return;
    }

    console.log("[confirmMint] Receipt found, logs count:", receipt.logs.length);
    const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");
    console.log("[confirmMint] Expected topic:", CARD_MINTED_TOPIC);
    
    const cardsCollection = await getCollection("cards");
    const txCollection = await getCollection("transactions");
    const confirmedTokenIds: number[] = [];
    let mintIndex = 0;

    for (const log of receipt.logs) {
      const logAddress = log.address.toLowerCase();
      const topicMatch = log.topics[0] === CARD_MINTED_TOPIC;
      const addressMatch = logAddress === cleanContractAddress;
      
      if (topicMatch && addressMatch) {
        const tokenId = parseInt(log.topics[1], 16);
        const logData = log.data.slice(2);
        const rarity = parseInt(logData.slice(64, 128), 16);
        confirmedTokenIds.push(tokenId);
        console.log("[confirmMint] Confirmed tokenId:", tokenId, "rarity:", rarity);

        await cardsCollection.updateOne(
          { txId, pickIndex: mintIndex },
          { $set: { tokenId, status: "Digital", rarity, lastOnChainSync: new Date().toISOString() } }
        );
        mintIndex++;
      }
    }

    if (confirmedTokenIds.length > 0) {
      await txCollection.updateOne(
        { _id: parseObjectId(txId) },
        { $set: { status: "confirmed", tokenIds: confirmedTokenIds } }
      );
      console.log("[confirmMint] Updated", confirmedTokenIds.length, "cards to confirmed");
    } else {
      console.warn("[confirmMint] No matching CardMinted events found in logs");
    }
  } catch (err) {
    console.error("[mint] background confirm failed:", err);
  }
}

/** Generate a unique 5-character hex Card ID (e.g. "a3f1b"), with collision retry */
async function generateUniqueCardId(cardsCollection: { findOne: (q: Record<string, unknown>) => Promise<unknown> }): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const id = randomBytes(3).toString("hex").slice(0, 5);
    const existing = await cardsCollection.findOne({ cardId: id });
    if (!existing) return id;
  }
  throw new Error("Failed to generate unique cardId after 5 attempts");
}

const PACK_TYPES: Record<string, { price: number; cards: number; guaranteed: number }> = {
  standard: { price: 500, cards: 5, guaranteed: 1 },
  booster: { price: 800, cards: 10, guaranteed: 2 },
};

export async function POST(request: Request) {
  const { packType = "standard" } = await request.json();

  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user._id.toString();

  const pack = PACK_TYPES[packType];
  if (!pack) {
    return NextResponse.json(
      { error: "Invalid pack type. Use 'standard' or 'booster'." },
      { status: 400 }
    );
  }

  // Deduct credit FIRST
  let newBalance: number;
  try {
    newBalance = await deductCredits(userId, pack.price);
  } catch {
    return NextResponse.json(
      { error: "Insufficient credit balance", price: pack.price },
      { status: 402 }
    );
  }

  // Bungkus sisa proses — refund jika gagal
  try {
    await seedCardTemplates();
    await updateArtworkUrls();

    // Build rarities based on pack type
    const rarities = await buildPackRarities(pack.cards, pack.guaranteed);

    // Pick templates in parallel
    const templates = await Promise.all(rarities.map((r) => pickCardTemplate(r)));

    // Validate wallet address before blockchain call
    const walletAddress = user.walletAddress?.trim().replace(/[\r\n]/g, '');
    console.log("[mint] User wallet address:", walletAddress);
    console.log("[mint] User ID:", user._id);
    console.log("[mint] User object keys:", Object.keys(user));
    
    if (!walletAddress) {
      throw new Error(`Wallet address is missing for user ${user._id}`);
    }
    
    if (!ethers.isAddress(walletAddress)) {
      throw new Error(`Invalid wallet address format: "${walletAddress}"`);
    }

    // Mint batch — 1 tx untuk seluruh pack (atomik)
    console.log("[mint] Calling mintBatch with address:", walletAddress);
    const txHash = await mintBatch(walletAddress, rarities);

    // Simpan transaksi
    const contractAddress = process.env.CONTRACT_ADDRESS?.trim()!;
    const txCollection = await getCollection("transactions");
    const txResult = await txCollection.insertOne({
      userId: user._id.toString(),
      type: "mint",
      amount: pack.price,
      rarities,
      templateIds: templates.map((t) => t.templateId),
      tokenIds: [], // populated saat konfirmasi on-chain
      purchasePrice: pack.price,
      txHash,
      status: "pending",
      contractAddress,
      fromAddress: process.env.ADMIN_WALLET_ADDRESS?.trim(),
      toAddress: user.walletAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Generate card IDs in parallel and save
    const cardsCollection = await getCollection("cards");
    const cardIds = await Promise.all(
      templates.map(() => generateUniqueCardId(cardsCollection))
    );
    const cardDocs = templates.map((template, i) => ({
      cardId: cardIds[i],
      tokenId: null,
      txId: txResult.insertedId.toString(),
      pickIndex: i,
      templateId: template.templateId,
      rarity: rarities[i],
      ownerAddress: user.walletAddress,
      status: "pending",
      contractAddress,
      viewed: false,
      createdAt: new Date().toISOString(),
    }));
    await cardsCollection.insertMany(cardDocs);

    // Build response array — return immediately (ADR-018: async blockchain pattern)
    const cards = templates.map((template, i) => ({
      rarity: rarities[i],
      template: {
        templateId: template.templateId,
        name: template.name,
        artworkUrl: template.artworkUrl,
      },
    }));

    // Fire-and-forget: confirm on-chain in background
    // Use setTimeout to allow the response to be sent first
    setTimeout(() => {
      confirmMint(txHash, txResult.insertedId.toString(), contractAddress).catch(err => {
        console.error("[mint] background confirm failed:", err);
      });
    }, 100);

    // Also trigger immediate confirmation attempt (non-blocking)
    confirmMint(txHash, txResult.insertedId.toString(), contractAddress).catch(() => {});

    return NextResponse.json({
      status: friendlyTxStatus("pending"),
      txId: generateInvoiceId(txResult.insertedId.toString()),
      cards,
      newBalance,
    });
  } catch (error) {
    // REFUND
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Mint failed after deduct, refunding:", errMsg, error);
    let refunded = false;
    try {
      await addCredits(userId, pack.price);
      refunded = true;
    } catch (refundError) {
      console.error("CRITICAL: Refund failed:", refundError);
    }

    const message = refunded
      ? `Mint failed: ${errMsg}`
      : `Mint failed: ${errMsg}. Credit refund FAILED — contact support`;

    return NextResponse.json({ error: message, refunded }, { status: 500 });
  }
}
