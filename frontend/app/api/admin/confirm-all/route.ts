import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { confirmTransaction } from "@/lib/transactions";
import { getEntropySeed, fulfillPackEntropy, getEntropyRequestData, getFulfillTxHash } from "@/lib/blockchain";
import { buildPackRaritiesFromSeed } from "@/lib/odds";
import { pickCardTemplatesBulk } from "@/lib/card-templates";
import { ethers } from "ethers";

export const maxDuration = 10; // Safe for Hobby plan

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

/**
 * Sync an already-fulfilled-on-chain transaction to MongoDB.
 * Used when fulfillPack() succeeded but MongoDB wasn't updated (race condition).
 */
async function syncFulfilledToMongo(
  txId: string,
  sequenceNumber: number,
  contractAddress: string,
) {
  const txCollection = await getCollection("transactions");
  const cardsCollection = await getCollection("cards");

  const [requestData, seed] = await Promise.all([
    getEntropyRequestData(sequenceNumber),
    getEntropySeed(sequenceNumber),
  ]);

  const { packSize, guaranteed } = requestData;
  const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);

  // Try to find fulfill txHash from PackFulfilled event
  let fulfillTxHash: string | null = null;
  try {
    fulfillTxHash = await getFulfillTxHash(sequenceNumber);
  } catch (e) {
    console.warn(`[confirm-all] recover: failed to get fulfill txHash for seq ${sequenceNumber}:`, e);
  }

  // Parse CardMinted events from fulfill receipt (if txHash available)
  const confirmedTokenIds: number[] = [];
  let mintIndex = 0;
  const cleanContractAddress = contractAddress.trim().toLowerCase();

  if (fulfillTxHash) {
    try {
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL?.trim());
      const receipt = await provider.getTransactionReceipt(fulfillTxHash);
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
      console.warn(`[confirm-all] recover: failed to parse fulfill receipt for seq ${sequenceNumber}:`, e);
    }
  }

  // Update card rarities and templateId (even if tokenIds weren't recovered)
  const templates = await pickCardTemplatesBulk(rarities);
  const cardBulkOps = rarities.map((rarity, i) => ({
    updateOne: {
      filter: { txId, pickIndex: i },
      update: { $set: { rarity, templateId: templates[i].templateId } },
    },
  }));
  await cardsCollection.bulkWrite(cardBulkOps);

  // Update transaction — on-chain fulfilled means we can mark confirmed
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

  return { fulfilled: true, fulfillTxHash: fulfillTxHash || undefined, rarities, tokenIds: confirmedTokenIds };
}

/**
 * Admin endpoint: confirm all pending transactions.
 * - For "pending" status: calls confirmTransaction() to check on-chain receipt
 * - For "entropy_pending" status: on-chain-first idempotency, then fulfill if needed
 */
export async function POST() {
  try {
    const txCollection = await getCollection("transactions");
    const results: Array<{
      txId: string;
      type?: string;
      fulfilled?: boolean;
      skipped?: boolean;
      skipReason?: string;
      newStatus?: string;
      fulfillTxHash?: string;
      rarities?: number[];
      synced?: boolean;
      error?: string;
    }> = [];

    // Process "pending" transactions (legacy flow - check receipt)
    const pendingTxs = await txCollection
      .find({ status: "pending" })
      .toArray();

    for (const tx of pendingTxs) {
      const txId = tx._id.toString();
      try {
        const newStatus = await confirmTransaction(txId);
        results.push({ txId, type: "pending", newStatus });
      } catch (err) {
        results.push({ txId, type: "pending", error: (err as Error).message });
      }
    }

    // Process "entropy_pending" transactions (entropy flow - on-chain-first idempotency)
    const entropyPendingTxs = await txCollection
      .find({ status: "entropy_pending" })
      .toArray();

    // Limit to 10 per call to stay under 10s timeout
    const batchSize = Math.min(entropyPendingTxs.length, 10);
    const batch = entropyPendingTxs.slice(0, batchSize);

    for (const tx of batch) {
      const txId = tx._id.toString();
      const sequenceNumber = tx.entropySequenceNumber;

      if (!sequenceNumber && sequenceNumber !== 0) {
        results.push({ txId, type: "entropy_pending", skipped: true, skipReason: "missing_sequence" });
        continue;
      }

      // NOTE: Sengaja pakai env var langsung, bukan tx.contractAddress.
      // tx.contractAddress bisa menyimpan alamat lama jika env var di-update
      // setelah transaksi dibuat. Event matching harus selalu pakai kontrak aktif.
      const contractAddress = process.env.CONTRACT_ADDRESS?.trim()!;

      try {
        // ON-CHAIN-FIRST: check if already fulfilled on-chain
        const requestData = await getEntropyRequestData(sequenceNumber);
        if (requestData.fulfilled) {
          console.log(`[confirm-all] Sequence ${sequenceNumber} already fulfilled on-chain, syncing...`);
          const syncResult = await syncFulfilledToMongo(txId, sequenceNumber, contractAddress);
          results.push({
            txId,
            type: "entropy_pending",
            fulfilled: true,
            synced: true,
            fulfillTxHash: syncResult.fulfillTxHash,
            rarities: syncResult.rarities,
          });
          continue;
        }

        // Check if seed is available
        const seed = await getEntropySeed(sequenceNumber);
        if (!seed || seed === "0x0000000000000000000000000000000000000000000000000000000000000000") {
          results.push({ txId, type: "entropy_pending", skipped: true, skipReason: "waiting_for_seed" });
          continue;
        }

        // Compute rarities from seed
        const packSize = tx.rarities?.length || 5;
        const guaranteed = tx.amount === 800 ? 2 : 1;
        const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);

        // Fulfill on-chain — with race condition catch
        let fulfillTxHash: string;
        try {
          fulfillTxHash = await fulfillPackEntropy(sequenceNumber, tx.toAddress, rarities);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          if (errMsg.includes("Already fulfilled")) {
            // Race condition: another request fulfilled it between our check and this call
            console.warn(`[confirm-all] Race condition: seq ${sequenceNumber} already fulfilled, syncing...`);
            const syncResult = await syncFulfilledToMongo(txId, sequenceNumber, contractAddress);
            results.push({
              txId,
              type: "entropy_pending",
              fulfilled: true,
              synced: true,
              fulfillTxHash: syncResult.fulfillTxHash,
              rarities: syncResult.rarities,
            });
            continue;
          }
          throw err; // Re-throw non-idempotent errors
        }

        // Update transaction
        await txCollection.updateOne(
          { _id: parseObjectId(txId) },
          {
            $set: {
              status: "pending",
              entropySeed: seed,
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

        results.push({ txId, type: "entropy_pending", fulfilled: true, fulfillTxHash, rarities });
      } catch (err) {
        results.push({ txId, type: "entropy_pending", error: (err as Error).message });
      }
    }

    // Summary
    const fulfilled = results.filter(r => r.fulfilled).length;
    const skipped = results.filter(r => r.skipped).length;
    const errors = results.filter(r => r.error).length;
    const remaining = entropyPendingTxs.length - batchSize;

    return NextResponse.json(
      {
        processed: results.length,
        fulfilled,
        skipped,
        errors,
        remainingEntropyPending: remaining,
        note: remaining > 0 ? `${remaining} more entropy_pending transactions. Click again to process next batch.` : null,
        results,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Confirm-all error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
