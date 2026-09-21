/**
 * Repair exported cards whose MongoDB state drifted from the chain
 * (ADR-031, stage 6).
 *
 * Read-and-correct only: it never sends a transaction, so it cannot spend
 * sponsorship budget and is safe to run repeatedly. Batched at 10 because
 * each card costs at least one RPC read and this runs under maxDuration = 10
 * (ADR-018), the same constraint that shapes confirm-all.
 */
import { NextResponse } from "next/server";
import { reconcileExportedCards } from "@/lib/privy-reconcile";

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Number(body?.limit) || 10, 10);

    const results = await reconcileExportedCards(limit);
    const changed = results.filter((r) => r.changed);

    return NextResponse.json({
      success: true,
      scanned: results.length,
      changed: changed.length,
      results,
    });
  } catch (error) {
    console.error("[admin/privy-reconcile] failed:", error);
    return NextResponse.json({ error: "Reconcile failed." }, { status: 500 });
  }
}
