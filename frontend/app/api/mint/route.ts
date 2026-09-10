import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const maxDuration = 30;
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import {
  mintBatch,
  waitForReceipt,
  requestPackEntropy,
  fulfillPackEntropy,
  getEntropySeed,
} from "@/lib/blockchain";
import { buildPackRarities, buildPackRaritiesFromSeed } from "@/lib/odds";
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

/** Background entropy: poll for seed, compute rarities, fulfill pack */
async function fulfillEntropyPack(
  txId: string,
  sequenceNumber: number,
  userAddr: string,
  packSize: number,
  guaranteed: number,
  contractAddress: string
) {
  const txCollection = await getCollection("transactions");
  const MAX_POLL = 30; // 30 seconds max
  const POLL_INTERVAL = 1000;

  try {
    // Poll for seed
    let seed: string | null = null;
    for (let i = 0; i < MAX_POLL; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
      const rawSeed = await getEntropySeed(sequenceNumber);
      if (rawSeed && rawSeed !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        seed = rawSeed;
        break;
      }
    }

    if (!seed) {
      console.error("[entropy] Seed not received after", MAX_POLL, "seconds");
      await txCollection.updateOne(
        { _id: parseObjectId(txId) },
        { $set: { status: "failed", error: "Entropy timeout", updatedAt: new Date().toISOString() } }
      );
      return;
    }

    // Update tx with seed
    await txCollection.updateOne(
      { _id: parseObjectId(txId) },
      { $set: { entropySeed: seed, updatedAt: new Date().toISOString() } }
    );

    // Compute rarities deterministically from seed
    const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);

    // Fulfill pack on-chain
    const fulfillTxHash = await fulfillPackEntropy(sequenceNumber, userAddr, rarities);

    // Update tx with fulfill hash and rarities
    await txCollection.updateOne(
      { _id: parseObjectId(txId) },
      {
        $set: {
          status: "pending",
          txHash: fulfillTxHash,
          rarities,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    // Update card rarities
    const cardsCollection = await getCollection("cards");
    for (let i = 0; i < rarities.length; i++) {
      await cardsCollection.updateOne(
        { txId, pickIndex: i },
        { $set: { rarity: rarities[i] } }
      );
    }

    // Confirm mint
    confirmMint(fulfillTxHash, txId, contractAddress).catch(err => {
      console.error("[entropy] background confirm failed:", err);
    });
  } catch (err) {
    console.error("[entropy] fulfill failed:", err);
    await txCollection.updateOne(
      { _id: parseObjectId(txId) },
      { $set: { status: "failed", error: String(err), updatedAt: new Date().toISOString() } }
    );
  }
}

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

    // Validate wallet address before blockchain call
    const walletAddress = user.walletAddress?.trim().replace(/[\r\n]/g, '');
    if (!walletAddress) {
      throw new Error(`Wallet address is missing for user ${user._id}`);
    }
    if (!ethers.isAddress(walletAddress)) {
      throw new Error(`Invalid wallet address format: "${walletAddress}"`);
    }

    const contractAddress = process.env.CONTRACT_ADDRESS?.trim()!;
    const entropyContractAddress = process.env.ENTROPY_CONTRACT_ADDRESS?.trim();
    const useEntropy = !!entropyContractAddress;

    if (useEntropy) {
      // === 3-STEP ENTROPY FLOW ===
      console.log("[mint] Using Pyth Entropy flow");

      // Step 1: Request entropy
      const { sequenceNumber, txHash: requestTxHash } = await requestPackEntropy(
        Date.now(), // packId
        walletAddress,
        pack.cards,
        pack.guaranteed
      );

      // Pick templates (will be updated with correct rarities later)
      const placeholderRarities = new Array(pack.cards).fill(0);
      const templates = await Promise.all(placeholderRarities.map((r) => pickCardTemplate(r)));

      // Save transaction with entropy_pending status
      const txCollection = await getCollection("transactions");
      const txResult = await txCollection.insertOne({
        userId: user._id.toString(),
        type: "mint",
        amount: pack.price,
        rarities: placeholderRarities,
        templateIds: templates.map((t) => t.templateId),
        tokenIds: [],
        purchasePrice: pack.price,
        txHash: requestTxHash,
        status: "entropy_pending",
        contractAddress,
        entropySequenceNumber: sequenceNumber,
        entropySeed: null,
        rarityHash: null,
        fromAddress: process.env.ADMIN_WALLET_ADDRESS?.trim(),
        toAddress: walletAddress,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Generate card IDs
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
        rarity: placeholderRarities[i], // Will be updated by fulfillEntropyPack
        ownerAddress: walletAddress,
        status: "pending",
        contractAddress,
        viewed: false,
        createdAt: new Date().toISOString(),
      }));
      await cardsCollection.insertMany(cardDocs);

      // Background: poll for seed → compute rarities → fulfill → confirm
      const txIdStr = txResult.insertedId.toString();
      setTimeout(() => {
        fulfillEntropyPack(txIdStr, sequenceNumber, walletAddress, pack.cards, pack.guaranteed, contractAddress).catch(err => {
          console.error("[mint] entropy fulfill failed:", err);
        });
      }, 100);

      // Return immediately with placeholder cards (will be updated)
      const cards = templates.map((template, i) => ({
        rarity: placeholderRarities[i],
        template: {
          templateId: template.templateId,
          name: template.name,
          artworkUrl: template.artworkUrl,
        },
      }));

      return NextResponse.json({
        status: friendlyTxStatus("entropy_pending"),
        txId: generateInvoiceId(txResult.insertedId.toString()),
        cards,
        newBalance,
        entropy: true,
      });
    } else {
      // === LEGACY FLOW (Math.random fallback) ===
      console.log("[mint] Using legacy Math.random flow (ENTROPY_CONTRACT_ADDRESS not set)");

      const rarities = await buildPackRarities(pack.cards, pack.guaranteed);
      const templates = await Promise.all(rarities.map((r) => pickCardTemplate(r)));

      const txHash = await mintBatch(walletAddress, rarities);

      const txCollection = await getCollection("transactions");
      const txResult = await txCollection.insertOne({
        userId: user._id.toString(),
        type: "mint",
        amount: pack.price,
        rarities,
        templateIds: templates.map((t) => t.templateId),
        tokenIds: [],
        purchasePrice: pack.price,
        txHash,
        status: "pending",
        contractAddress,
        fromAddress: process.env.ADMIN_WALLET_ADDRESS?.trim(),
        toAddress: walletAddress,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

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
        ownerAddress: walletAddress,
        status: "pending",
        contractAddress,
        viewed: false,
        createdAt: new Date().toISOString(),
      }));
      await cardsCollection.insertMany(cardDocs);

      const cards = templates.map((template, i) => ({
        rarity: rarities[i],
        template: {
          templateId: template.templateId,
          name: template.name,
          artworkUrl: template.artworkUrl,
        },
      }));

      setTimeout(() => {
        confirmMint(txHash, txResult.insertedId.toString(), contractAddress).catch(err => {
          console.error("[mint] background confirm failed:", err);
        });
      }, 100);

      confirmMint(txHash, txResult.insertedId.toString(), contractAddress).catch(() => {});

      return NextResponse.json({
        status: friendlyTxStatus("pending"),
        txId: generateInvoiceId(txResult.insertedId.toString()),
        cards,
        newBalance,
        entropy: false,
      });
    }
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
