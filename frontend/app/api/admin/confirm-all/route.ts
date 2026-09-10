import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { confirmTransaction } from "@/lib/transactions";
import { getEntropySeed, fulfillPackEntropy, getEntropyRarityHash } from "@/lib/blockchain";
import { buildPackRaritiesFromSeed } from "@/lib/odds";

/**
 * Admin endpoint: confirm all pending transactions.
 * - For "pending" status: calls confirmTransaction() to check on-chain receipt
 * - For "entropy_pending" status: attempts to fulfill entropy pack
 */
export async function POST() {
  try {
    const txCollection = await getCollection("transactions");

    // Process "pending" transactions (legacy flow - check receipt)
    const pendingTxs = await txCollection
      .find({ status: "pending" })
      .toArray();

    const results = [];

    for (const tx of pendingTxs) {
      const txId = tx._id.toString();
      try {
        const newStatus = await confirmTransaction(txId);
        results.push({ txId, type: "pending", oldStatus: "pending", newStatus });
      } catch (err) {
        results.push({ txId, type: "pending", error: (err as Error).message });
      }
    }

    // Process "entropy_pending" transactions (entropy flow - fulfill)
    const entropyPendingTxs = await txCollection
      .find({ status: "entropy_pending" })
      .toArray();

    for (const tx of entropyPendingTxs) {
      const txId = tx._id.toString();
      const sequenceNumber = tx.entropySequenceNumber;

      if (!sequenceNumber && sequenceNumber !== 0) {
        results.push({ txId, type: "entropy_pending", skipped: true, reason: "Missing sequence number" });
        continue;
      }

      try {
        // Check if seed exists on-chain
        const seed = await getEntropySeed(sequenceNumber);
        if (!seed || seed === "0x0000000000000000000000000000000000000000000000000000000000000000") {
          results.push({ txId, type: "entropy_pending", skipped: true, reason: "Seed not yet available" });
          continue;
        }

        // Check if already fulfilled on-chain
        const existingHash = await getEntropyRarityHash(sequenceNumber);
        if (existingHash && existingHash !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
          results.push({ txId, type: "entropy_pending", skipped: true, reason: "Already fulfilled on-chain" });
          continue;
        }

        // Compute rarities
        const packSize = tx.rarities?.length || 5;
        const guaranteed = tx.amount === 800 ? 2 : 1;
        const rarities = buildPackRaritiesFromSeed(seed, packSize, guaranteed);

        // Fulfill on-chain
        const userAddr = tx.toAddress;
        const fulfillTxHash = await fulfillPackEntropy(sequenceNumber, userAddr, rarities);

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

        // Update card rarities
        const cardsCollection = await getCollection("cards");
        for (let i = 0; i < rarities.length; i++) {
          await cardsCollection.updateOne(
            { txId, pickIndex: i },
            { $set: { rarity: rarities[i] } }
          );
        }

        results.push({ txId, type: "entropy_pending", fulfilled: true, fulfillTxHash, rarities });
      } catch (err) {
        results.push({ txId, type: "entropy_pending", error: (err as Error).message });
      }
    }

    const fulfilled = results.filter(r => r.fulfilled).length;
    const skipped = results.filter(r => r.skipped).length;
    const errors = results.filter(r => r.error).length;

    return NextResponse.json(
      {
        processed: results.length,
        fulfilled,
        skipped,
        errors,
        results,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Confirm-all error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
