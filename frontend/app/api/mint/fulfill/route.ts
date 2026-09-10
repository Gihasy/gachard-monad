import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getEntropySeed, fulfillPackEntropy, waitForReceipt, getEntropyRarityHash } from "@/lib/blockchain";
import { buildPackRaritiesFromSeed } from "@/lib/odds";
import { ethers } from "ethers";

export const maxDuration = 10; // Safe for Hobby plan without Fluid Compute

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

export async function POST(request: Request) {
  try {
    const { txId } = await request.json();

    if (!txId) {
      return NextResponse.json({ success: false, error: "txId required" }, { status: 400 });
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const txCollection = await getCollection("transactions");
    const tx = await txCollection.findOne({ _id: parseObjectId(txId) });

    if (!tx) {
      return NextResponse.json({ success: false, error: "Transaction not found" }, { status: 404 });
    }

    // Verify ownership
    if (tx.userId !== user._id.toString()) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });
    }

    // Check if already fulfilled (idempotent)
    if (tx.status === "confirmed") {
      const cardsCollection = await getCollection("cards");
      const cards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
      return NextResponse.json({
        success: true,
        alreadyFulfilled: true,
        cards: cards.map(c => ({ rarity: c.rarity, cardId: c.cardId, tokenId: c.tokenId })),
      });
    }

    // Check if in correct state
    if (tx.status !== "entropy_pending") {
      return NextResponse.json({
        success: false,
        error: `Invalid transaction status: ${tx.status}`,
      }, { status: 400 });
    }

    const sequenceNumber = tx.entropySequenceNumber;
    if (!sequenceNumber && sequenceNumber !== 0) {
      return NextResponse.json({ success: false, error: "Missing entropy sequence number" }, { status: 400 });
    }

    // ONE-SHOT check: is seed available on-chain? (NO polling loop)
    const seed = await getEntropySeed(sequenceNumber);
    const seedAvailable = seed && seed !== "0x0000000000000000000000000000000000000000000000000000000000000000";

    if (!seedAvailable) {
      // Seed not ready yet — tell client to retry
      return NextResponse.json({
        success: false,
        retry: true,
        status: "waiting_for_seed",
        message: "Entropy seed not available yet",
      });
    }

    // Seed is available — proceed with fulfillment
    const contractAddress = tx.contractAddress || process.env.CONTRACT_ADDRESS?.trim()!;
    const userAddr = tx.toAddress;
    const packSize = tx.rarities?.length || 5;
    const guaranteed = tx.amount === 800 ? 2 : 1; // 800 Credits = booster (2 guaranteed)

    // Update tx with seed
    await txCollection.updateOne(
      { _id: parseObjectId(txId) },
      { $set: { entropySeed: seed, updatedAt: new Date().toISOString() } }
    );

    // Compute rarities deterministically from seed
    const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);

    // Check if already fulfilled on-chain (idempotent)
    const existingHash = await getEntropyRarityHash(sequenceNumber);
    const alreadyFulfilledOnChain = existingHash && existingHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";

    let fulfillTxHash: string;

    if (alreadyFulfilledOnChain) {
      fulfillTxHash = tx.txHash || "";
    } else {
      // Fulfill pack on-chain (this takes 1-3 seconds for Monad block confirmation)
      fulfillTxHash = await fulfillPackEntropy(sequenceNumber, userAddr, rarities);
    }

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

    // Wait for on-chain confirmation (1-3 blocks on Monad)
    const receipt = await waitForReceipt(fulfillTxHash, 10, 1000);

    if (receipt && receipt.status === 1) {
      // Parse CardMinted events
      const confirmedTokenIds: number[] = [];
      let mintIndex = 0;
      const cleanContractAddress = contractAddress.trim().toLowerCase();

      for (const log of receipt.logs) {
        if (log.topics[0] === CARD_MINTED_TOPIC && log.address.toLowerCase() === cleanContractAddress) {
          const tokenId = parseInt(log.topics[1], 16);
          const logData = log.data.slice(2);
          const rarity = parseInt(logData.slice(64, 128), 16);
          confirmedTokenIds.push(tokenId);

          await cardsCollection.updateOne(
            { txId, pickIndex: mintIndex },
            { $set: { tokenId, status: "Digital", rarity, lastOnChainSync: new Date().toISOString() } }
          );
          mintIndex++;
        }
      }

      // Update transaction status to confirmed
      await txCollection.updateOne(
        { _id: parseObjectId(txId) },
        { $set: { status: "confirmed", tokenIds: confirmedTokenIds, updatedAt: new Date().toISOString() } }
      );

      // Return final cards
      const finalCards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
      return NextResponse.json({
        success: true,
        cards: finalCards.map(c => ({ rarity: c.rarity, cardId: c.cardId, tokenId: c.tokenId })),
        tokenIds: confirmedTokenIds,
      });
    } else {
      // Mint confirmation failed
      await txCollection.updateOne(
        { _id: parseObjectId(txId) },
        { $set: { status: "failed", error: "Mint confirmation failed", updatedAt: new Date().toISOString() } }
      );
      return NextResponse.json({ success: false, error: "Mint confirmation failed" });
    }

  } catch (error) {
    console.error("[fulfill] Error:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
