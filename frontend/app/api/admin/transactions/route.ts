import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { generateInvoiceId } from "@/lib/invoice";
import { friendlyTxStatus } from "@/lib/status-map";
import { adminOnly, isUnlockedAdmin } from "@/lib/admin-tier";

/**
 * `userId` is a user's MongoDB ObjectId. ADR-032 removed exactly that
 * identifier from the public marketplace response, and this route was still
 * publishing one per transaction.
 *
 * `rawId` stays public: it is the transaction's own id, it grants nothing,
 * and the invoice id beside it is derived from it anyway.
 */
export async function GET(request: Request) {
  const unlocked = isUnlockedAdmin(request);
  try {
    const txCollection = await getCollection("transactions");
    const txs = await txCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    const result = txs.map((tx) => ({
      id: generateInvoiceId(tx._id.toString()),
      rawId: tx._id.toString(),
      txHash: tx.txHash || null,
      status: friendlyTxStatus(tx.status),
      rawStatus: tx.status,
      type: tx.type,
      tokenId: tx.tokenId ?? null,
      tokenIds: tx.tokenIds ?? null,
      ...adminOnly(unlocked, { userId: tx.userId }),
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      error: tx.error ?? null,
      riskScore: tx.riskScore ?? null,
      flagged: tx.flagged ?? false,
      riskReasoning: tx.riskReasoning ?? null,
      amount: tx.amount ?? null,
      rarity: tx.rarity ?? null,
    }));

    return NextResponse.json(
      { transactions: result },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Admin transactions error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
