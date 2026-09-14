import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getEntropySeed, fulfillPackEntropy, waitForReceipt, getEntropyRequestData, getFulfillTxHash } from "@/lib/blockchain";
import { buildPackRaritiesFromSeed } from "@/lib/odds";
import { pickCardTemplatesBulk } from "@/lib/card-templates";
import { ethers } from "ethers";

export const maxDuration = 10; // Safe for Hobby plan without Fluid Compute

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

/**
 * Enrich card documents with template info (artworkUrl, name) for client display.
 * Same logic as /api/cards/route.ts template lookup.
 */
async function enrichCardsWithTemplates(cards: Array<Record<string, unknown>>) {
  const templatesCollection = await getCollection("card_templates");
  const uniqueTemplateIds = [...new Set(cards.map(c => c.templateId).filter(Boolean))];
  const templates = uniqueTemplateIds.length > 0
    ? await templatesCollection.find({ templateId: { $in: uniqueTemplateIds } }).toArray()
    : [];
  const templateMap = new Map(templates.map((t: Record<string, unknown>) => [t.templateId as string, t]));

  return cards.map(c => {
    const templateId = c.templateId as string | undefined;
    const template = templateId ? templateMap.get(templateId) : null;
    return {
      rarity: c.rarity as number,
      cardId: c.cardId as string | undefined,
      tokenId: c.tokenId as number | undefined,
      template: template ? {
        templateId: (template as Record<string, unknown>).templateId as string,
        name: (template as Record<string, unknown>).name as string,
        artworkUrl: (template as Record<string, unknown>).artworkUrl as string,
      } : undefined,
    };
  });
}

/**
 * Recovery path: pack is already fulfilled on-chain but MongoDB wasn't synced.
 * Reads on-chain state, syncs to MongoDB, returns success response.
 */
async function recoverFromChain(
  txId: string,
  sequenceNumber: number,
  contractAddress: string,
) {
  const txCollection = await getCollection("transactions");
  const cardsCollection = await getCollection("cards");

  // Read on-chain data in parallel
  const [requestData, seed] = await Promise.all([
    getEntropyRequestData(sequenceNumber),
    getEntropySeed(sequenceNumber),
  ]);

  const { packSize, guaranteed } = requestData;
  const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);

  // Find fulfill txHash from PackFulfilled event
  let fulfillTxHash: string | null = null;
  try {
    fulfillTxHash = await getFulfillTxHash(sequenceNumber);
  } catch (e) {
    console.warn(`[fulfill] recover: failed to get fulfill txHash for seq ${sequenceNumber}:`, e);
  }

  // Parse CardMinted events from fulfill receipt (if txHash available)
  const confirmedTokenIds: number[] = [];
  let mintIndex = 0;
  const cleanContractAddress = contractAddress.trim().toLowerCase();

  if (fulfillTxHash) {
    try {
      const receipt = await waitForReceipt(fulfillTxHash, 3, 1000);
      if (receipt && receipt.status === 1) {
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
      }
    } catch (e) {
      console.warn(`[fulfill] recover: failed to parse fulfill receipt for seq ${sequenceNumber}:`, e);
    }
  }

  // Update card rarities and templateId (even if tokenIds weren't recovered from events)
  const templates = await pickCardTemplatesBulk(rarities);
  const cardBulkOps = rarities.map((rarity, i) => ({
    updateOne: {
      filter: { txId, pickIndex: i },
      update: { $set: { rarity, templateId: templates[i].templateId } },
    },
  }));
  await cardsCollection.bulkWrite(cardBulkOps);

  // Update transaction — only overwrite txHash if we found the fulfill hash
  const updateFields: Record<string, unknown> = {
    status: "confirmed",
    entropySeed: seed,
    rarities,
    tokenIds: confirmedTokenIds,
    updatedAt: new Date().toISOString(),
  };
  if (fulfillTxHash) {
    updateFields.txHash = fulfillTxHash;
  }

  await txCollection.updateOne(
    { _id: parseObjectId(txId) },
    { $set: updateFields }
  );

  // Return final cards with template info
  const finalCards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
  const enrichedCards = await enrichCardsWithTemplates(finalCards);
  return NextResponse.json({
    success: true,
    alreadyFulfilled: true,
    cards: enrichedCards,
    tokenIds: confirmedTokenIds,
  });
}

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

    // Fast path: already confirmed in MongoDB
    if (tx.status === "confirmed") {
      const cardsCollection = await getCollection("cards");
      const cards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
      const enrichedCards = await enrichCardsWithTemplates(cards);
      return NextResponse.json({
        success: true,
        alreadyFulfilled: true,
        cards: enrichedCards,
      });
    }

    // Reject non-entropy transactions
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

    const contractAddress = tx.contractAddress || process.env.CONTRACT_ADDRESS?.trim()!;

    // ON-CHAIN-FIRST idempotency check:
    // If already fulfilled on-chain, sync data to MongoDB and return success.
    // This handles the race condition where fulfillPack() succeeded but MongoDB wasn't updated.
    const requestData = await getEntropyRequestData(sequenceNumber);
    if (requestData.fulfilled) {
      console.log(`[fulfill] Sequence ${sequenceNumber} already fulfilled on-chain, recovering data...`);
      return await recoverFromChain(txId, sequenceNumber, contractAddress);
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

    // Fulfill pack on-chain — with race condition catch
    let fulfillTxHash: string;
    try {
      fulfillTxHash = await fulfillPackEntropy(sequenceNumber, userAddr, rarities);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("Already fulfilled")) {
        console.warn(`[fulfill] Race condition: seq ${sequenceNumber} already fulfilled, recovering...`);
        return await recoverFromChain(txId, sequenceNumber, contractAddress);
      }
      throw err;
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

    // Update card rarities and templateId (bulk)
    const cardsCollection = await getCollection("cards");
    const templates = await pickCardTemplatesBulk(rarities);
    const cardBulkOps = rarities.map((rarity, i) => ({
      updateOne: {
        filter: { txId, pickIndex: i },
        update: { $set: { rarity, templateId: templates[i].templateId } },
      },
    }));
    await cardsCollection.bulkWrite(cardBulkOps);

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

      // Return final cards with template info
      const finalCards = await cardsCollection.find({ txId }).sort({ pickIndex: 1 }).toArray();
      const enrichedCards = await enrichCardsWithTemplates(finalCards);
      return NextResponse.json({
        success: true,
        cards: enrichedCards,
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
