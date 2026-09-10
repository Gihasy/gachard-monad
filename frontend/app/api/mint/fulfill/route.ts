import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getEntropySeed, fulfillPackEntropy, waitForReceipt } from "@/lib/blockchain";
import { buildPackRaritiesFromSeed } from "@/lib/odds";
import { ethers } from "ethers";

export const maxDuration = 25; // Leave 5s buffer for processing after seed polling

const MAX_POLL_SECONDS = 20; // Poll for seed up to 20 seconds
const POLL_INTERVAL_MS = 1500; // Check every 1.5 seconds

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
      // Already done - return existing cards
      const cardsCollection = await getCollection("cards");
      const cards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
      return NextResponse.json({
        success: true,
        alreadyFulfilled: true,
        cards: cards.map(c => ({ rarity: c.rarity, cardId: c.cardId })),
      });
    }

    // Check if in correct state
    if (tx.status !== "entropy_pending") {
      return NextResponse.json({
        success: false,
        error: `Invalid transaction status: ${tx.status}. Expected: entropy_pending`,
      }, { status: 400 });
    }

    const sequenceNumber = tx.entropySequenceNumber;
    if (!sequenceNumber && sequenceNumber !== 0) {
      return NextResponse.json({ success: false, error: "Missing entropy sequence number" }, { status: 400 });
    }

    const contractAddress = tx.contractAddress || process.env.CONTRACT_ADDRESS?.trim()!;
    const userAddr = tx.toAddress;

    // Extract pack info from transaction
    const packSize = tx.rarities?.length || 5;
    // Count guaranteed based on pack type (stored in transaction)
    const guaranteed = tx.amount === 800 ? 2 : 1; // 800 Credits = booster (2 guaranteed), else standard (1)

    console.log(`[fulfill] Starting for tx ${txId}, sequence ${sequenceNumber}, packSize ${packSize}, guaranteed ${guaranteed}`);

    // Check if seed already exists on-chain (might have arrived already)
    let seed: string | null = null;
    const existingSeed = await getEntropySeed(sequenceNumber);
    if (existingSeed && existingSeed !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      seed = existingSeed;
      console.log(`[fulfill] Seed already available: ${seed.slice(0, 20)}...`);
    }

    // Poll for seed if not available yet
    if (!seed) {
      console.log(`[fulfill] Polling for seed (max ${MAX_POLL_SECONDS}s)...`);
      for (let i = 0; i < MAX_POLL_SECONDS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const rawSeed = await getEntropySeed(sequenceNumber);
        if (rawSeed && rawSeed !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
          seed = rawSeed;
          console.log(`[fulfill] Seed received after ${i * POLL_INTERVAL_MS / 1000}s: ${seed.slice(0, 20)}...`);
          break;
        }
      }
    }

    // Timeout check
    if (!seed) {
      console.error(`[fulfill] Seed not received after ${MAX_POLL_SECONDS}s`);
      await txCollection.updateOne(
        { _id: parseObjectId(txId) },
        { $set: { status: "failed", error: "Entropy timeout", updatedAt: new Date().toISOString() } }
      );
      return NextResponse.json({
        success: false,
        error: "timeout",
        message: "Entropy seed not received in time. Try again.",
      });
    }

    // Update tx with seed
    await txCollection.updateOne(
      { _id: parseObjectId(txId) },
      { $set: { entropySeed: seed, updatedAt: new Date().toISOString() } }
    );

    // Compute rarities deterministically from seed
    const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);
    console.log(`[fulfill] Computed rarities: [${rarities.join(",")}]`);

    // Check if this transaction was already fulfilled on-chain (idempotent check)
    const { getEntropyRarityHash } = await import("@/lib/blockchain");
    const existingHash = await getEntropyRarityHash(sequenceNumber);
    const isAlreadyFulfilled = existingHash && existingHash !== "0x0000000000000000000000000000000000000000000000000000000000000000";

    let fulfillTxHash: string;

    if (isAlreadyFulfilled) {
      console.log(`[fulfill] Already fulfilled on-chain, skipping fulfillPack call`);
      fulfillTxHash = tx.txHash || ""; // Use existing hash
    } else {
      // Fulfill pack on-chain
      console.log(`[fulfill] Calling fulfillPack on-chain...`);
      fulfillTxHash = await fulfillPackEntropy(sequenceNumber, userAddr, rarities);
      console.log(`[fulfill] Fulfill tx: ${fulfillTxHash}`);
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

    // Update card rarities in database
    const cardsCollection = await getCollection("cards");
    for (let i = 0; i < rarities.length; i++) {
      await cardsCollection.updateOne(
        { txId, pickIndex: i },
        { $set: { rarity: rarities[i] } }
      );
    }

    // Confirm mint (wait for on-chain confirmation)
    console.log(`[fulfill] Confirming mint on-chain...`);
    const receipt = await waitForReceipt(fulfillTxHash, 15, 1000);

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

      console.log(`[fulfill] Confirmed! ${confirmedTokenIds.length} cards minted`);

      // Return final cards
      const finalCards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
      return NextResponse.json({
        success: true,
        cards: finalCards.map(c => ({ rarity: c.rarity, cardId: c.cardId, tokenId: c.tokenId })),
        tokenIds: confirmedTokenIds,
      });
    } else {
      console.error(`[fulfill] Mint confirmation failed`);
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
