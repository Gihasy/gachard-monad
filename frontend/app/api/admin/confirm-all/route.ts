import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { confirmTransaction } from "@/lib/transactions";

/**
 * Admin endpoint: confirm all pending transactions.
 * Calls confirmTransaction() for each pending tx, which checks on-chain receipt
 * and updates status + populates tokenIds.
 */
export async function POST() {
  try {
    const txCollection = await getCollection("transactions");
    const pendingTxs = await txCollection
      .find({ status: "pending" })
      .toArray();

    const results = [];
    for (const tx of pendingTxs) {
      const txId = tx._id.toString();
      try {
        const newStatus = await confirmTransaction(txId);
        results.push({ txId, oldStatus: "pending", newStatus });
      } catch (err) {
        results.push({ txId, error: (err as Error).message });
      }
    }

    return NextResponse.json(
      {
        processed: results.length,
        results,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Confirm-all error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
