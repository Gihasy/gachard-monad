import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { generateInvoiceId } from "@/lib/invoice";
import { friendlyTxStatus } from "@/lib/status-map";

export async function GET() {
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
      userId: tx.userId,
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
