/**
 * Claim an exported card from the user's own Privy wallet, with Privy paying
 * the gas (ADR-031, stage 3).
 *
 * This transaction is not technically necessary: the card already belongs to
 * the user once the export transfer lands. It exists so the wallet does
 * something rather than merely receiving something, and it is given a real job
 * by being the precondition for importing back (see the import route).
 *
 * It is a zero-value self-transfer. The more meaningful payload,
 * recordVerification(), is onlyOwner at GachardCard.sol:176 and would revert
 * when called by a user wallet. Changing the contract to allow it would trade
 * ADR-031's zero-contract-change position for a redeploy, over a transaction
 * that is not required in the first place.
 *
 * Returns a transaction id, never a hash: the hash does not exist yet. Poll
 * /api/privy/status/[cardId] for it.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import {
  consumeSponsorshipBudget,
  isSponsorshipConfigured,
  resolveWalletId,
  sendSponsored,
} from "@/lib/privy-server";

export const maxDuration = 10;

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const { cardId, tokenId } = await request.json();
    if (!cardId && tokenId === undefined) {
      return NextResponse.json({ error: "cardId (or tokenId) is required" }, { status: 400 });
    }

    if (!isSponsorshipConfigured()) {
      return NextResponse.json(
        { error: "Wallet export is not available right now." },
        { status: 503 }
      );
    }

    const cardsCollection = await getCollection("cards");
    const card = cardId
      ? await cardsCollection.findOne({ cardId })
      : await cardsCollection.findOne({ tokenId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    if (card.ownerAddress !== user.walletAddress) {
      return NextResponse.json({ error: "Card does not belong to this user" }, { status: 403 });
    }
    if (card.status !== "Exported") {
      return NextResponse.json(
        { error: "Card has not been exported." },
        { status: 400 }
      );
    }

    // Idempotency before spending anything. A second call must not send a
    // second sponsored transaction, and must not consume budget either.
    if (card.exportClaimTxId) {
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        claimTxId: card.exportClaimTxId,
        claimTxHash: card.exportClaimTxHash ?? null,
      });
    }

    const budget = await consumeSponsorshipBudget(userId);
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "Daily limit for sponsored transactions reached. Try again tomorrow." },
        { status: 429 }
      );
    }

    const privyAddress: string = card.privyWalletAddress ?? user.privyWalletAddress;
    if (!privyAddress) {
      return NextResponse.json({ error: "No self-custody wallet on file." }, { status: 400 });
    }

    let walletId: string | null = user.privyWalletId ?? null;
    if (!walletId) {
      walletId = await resolveWalletId(privyAddress);
      if (!walletId) {
        return NextResponse.json(
          { error: "Could not locate the self-custody wallet." },
          { status: 400 }
        );
      }
      const usersCollection = await getCollection("users");
      await usersCollection.updateOne({ _id: user._id }, { $set: { privyWalletId: walletId } });
    }

    // No retry. A "could not coalesce error" from the RPC can accompany a
    // transaction that landed, so resending here would double-spend the
    // sponsorship budget. A failed claim is recoverable by calling again,
    // which the idempotency check above makes safe only because the id is
    // written immediately after this returns.
    const sent = await sendSponsored(walletId, { to: privyAddress });

    await cardsCollection.updateOne(
      { _id: card._id },
      {
        $set: {
          exportClaimTxId: sent.transactionId,
          exportClaimUserOpHash: sent.userOperationHash,
          exportClaimStatus: "pending",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      claimTxId: sent.transactionId,
      remainingToday: budget.remaining,
    });
  } catch (error) {
    console.error("[privy/export/claim] failed:", error);
    return NextResponse.json({ error: "Claim failed. Please try again." }, { status: 500 });
  }
}
