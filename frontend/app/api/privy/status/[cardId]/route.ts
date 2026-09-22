/**
 * Poll and settle a card's sponsored claim and import (ADR-031, stages 3-4).
 *
 * One read per call, no internal loop: routes run under maxDuration = 10
 * (ADR-018), so the loop lives on the client, the same shape as the pack
 * fulfil flow.
 *
 * This is where a sponsored transaction's hash is finally written, because it
 * does not exist when the transaction is sent.
 *
 * An import is only settled once the custodial wallet is actually holding the
 * token. ADR-031 and the spec described an anchored TransferSingle scan here,
 * carried over from the earlier design where the backend had to notice a
 * transfer it had not initiated. We now send the transfer ourselves and hold
 * its hash, so one balanceOf read is cheaper than log pagination and is
 * stronger evidence than a matching event. exportClaimBlock is still recorded
 * as provenance for the claim, it is just no longer load-bearing.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getBlockNumberForTx, getSponsoredStatus } from "@/lib/privy-server";
import { getBalance } from "@/lib/blockchain";

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
      importTxId: card.importTxId ?? null,
      importTxHash: card.importTxHash ?? null,
      importStatus: card.importStatus ?? null,
    };

    // A completed import has had its in-flight fields cleared, so every check
    // below would report "not settled" to anyone still polling. Settling is
    // otherwise one-shot: whoever observes the confirmation consumes it, and
    // a client that polled a moment later would spin until it gave up while
    // the card was already home.
    if (card.status === "Digital" && card.importStatus === "confirmed") {
      return NextResponse.json({ ...base, settled: true });
    }

    // Import takes priority: once one is in flight, the claim is already
    // settled and its state is only history.
    if (card.importTxId && !card.importTxHash) {
      const imp = await getSponsoredStatus(card.importTxId);

      if (imp.failed) {
        await cardsCollection.updateOne(
          { _id: card._id },
          { $set: { importStatus: "failed", updatedAt: new Date().toISOString() } }
        );
        return NextResponse.json({ ...base, importStatus: "failed", settled: false });
      }
      if (!imp.confirmed || !imp.hash) {
        return NextResponse.json({ ...base, importStatus: imp.status, settled: false });
      }

      // Confirm against chain state rather than the transaction alone. The
      // card is only back when the custodial wallet actually holds it, and
      // balanceOf answers that directly.
      //
      // The spec called for a TransferSingle scan anchored to the claim block.
      // That was inherited from the earlier design where the backend had to
      // notice a transfer it did not initiate. Here we sent the transfer and
      // hold its hash, so a single balance read is both cheaper and stronger
      // than matching an event.
      const held = await getBalance(card.ownerAddress, Number(card.tokenId));
      if (held === 0n) {
        console.warn(
          `[privy/status] import tx ${imp.hash} confirmed but token ${card.tokenId} not held by ${card.ownerAddress}`
        );
        await cardsCollection.updateOne(
          { _id: card._id },
          { $set: { importStatus: "unverified", importTxHash: imp.hash, updatedAt: new Date().toISOString() } }
        );
        return NextResponse.json({
          ...base,
          importTxHash: imp.hash,
          importStatus: "unverified",
          settled: false,
        });
      }

      await cardsCollection.updateOne(
        { _id: card._id },
        {
          $set: {
            status: "Digital",
            importTxHash: imp.hash,
            importStatus: "confirmed",
            importedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          // Clear the export cycle so a later export starts clean rather than
          // inheriting a stale claim that would wave the import gate through.
          $unset: {
            privyWalletAddress: "",
            exportClaimTxId: "",
            exportClaimTxHash: "",
            exportClaimBlock: "",
            exportClaimStatus: "",
            exportClaimUserOpHash: "",
            importTxId: "",
            importUserOpHash: "",
          },
        }
      );

      // Settle the history row as well, or it stays "Processing" forever
      // while the card itself reads as returned.
      const txCollection = await getCollection("transactions");
      await txCollection.updateOne(
        { privyTxId: card.importTxId },
        { $set: { status: "confirmed", txHash: imp.hash, updatedAt: new Date().toISOString() } }
      );

      return NextResponse.json({
        ...base,
        status: "Digital",
        importTxHash: imp.hash,
        importStatus: "confirmed",
        settled: true,
      });
    }

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
