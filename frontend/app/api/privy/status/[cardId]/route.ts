/**
 * Poll the state of a card's sponsored claim (ADR-031, stage 3).
 *
 * One read per call, no internal loop: routes run under maxDuration = 10
 * (ADR-018), so the loop lives on the client, the same shape as the pack
 * fulfil flow.
 *
 * This is where the claim's hash and block number are finally written. They do
 * not exist when the claim is sent, and exportClaimBlock is what the import
 * side anchors its event scan to, so losing it means falling back to scanning
 * from the chain head, which on ~0.3s blocks loses the trail within minutes
 * (the bug fixed in 4658e4e).
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getBlockNumberForTx, getSponsoredStatus } from "@/lib/privy-server";

export const maxDuration = 10;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const { cardId } = await params;

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cardsCollection = await getCollection("cards");
    const card = await cardsCollection.findOne({ cardId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    if (card.ownerAddress !== user.walletAddress) {
      return NextResponse.json({ error: "Card does not belong to this user" }, { status: 403 });
    }

    const base = {
      cardId,
      status: card.status,
      exportTxHash: card.exportTxHash ?? null,
      claimTxId: card.exportClaimTxId ?? null,
      claimTxHash: card.exportClaimTxHash ?? null,
      claimBlock: card.exportClaimBlock ?? null,
      claimStatus: card.exportClaimStatus ?? null,
    };

    // Nothing to resolve: either no claim yet, or it is already settled.
    if (!card.exportClaimTxId || card.exportClaimTxHash) {
      return NextResponse.json({ ...base, settled: Boolean(card.exportClaimTxHash) });
    }

    const state = await getSponsoredStatus(card.exportClaimTxId);

    if (state.failed) {
      await cardsCollection.updateOne(
        { _id: card._id },
        { $set: { exportClaimStatus: "failed", updatedAt: new Date().toISOString() } }
      );
      return NextResponse.json({ ...base, claimStatus: "failed", settled: false });
    }

    if (!state.confirmed || !state.hash) {
      return NextResponse.json({ ...base, claimStatus: state.status, settled: false });
    }

    // Block lookup is best-effort. A confirmed claim whose block we could not
    // read is still a confirmed claim, and re-polling will fill it in; writing
    // the hash but not the block is better than dropping both.
    let block: number | null = null;
    try {
      block = await getBlockNumberForTx(state.hash);
    } catch (e) {
      console.warn(`[privy/status] block lookup failed for ${state.hash}:`, e);
    }

    await cardsCollection.updateOne(
      { _id: card._id },
      {
        $set: {
          exportClaimTxHash: state.hash,
          exportClaimBlock: block,
          exportClaimStatus: "confirmed",
          exportClaimedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      ...base,
      claimTxHash: state.hash,
      claimBlock: block,
      claimStatus: "confirmed",
      settled: true,
    });
  } catch (error) {
    console.error("[privy/status] failed:", error);
    return NextResponse.json({ error: "Could not read export status." }, { status: 500 });
  }
}
