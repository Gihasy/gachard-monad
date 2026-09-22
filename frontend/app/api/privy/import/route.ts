/**
 * Bring an exported card back into Gachard (ADR-031, stage 4).
 *
 * The transfer is signed and sent by the user's own Privy wallet, with Privy
 * paying the gas. The backend cannot do this and deliberately has no route
 * that can: the card is held by the user, so only the user can move it. That
 * is the strongest evidence the ownership is real, and the admin console
 * having no equivalent button is the point, not an omission.
 *
 * Gated on the claim having confirmed. That is what stops the claim
 * transaction from being decoration: a card that was never claimed cannot
 * come back this way.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getBalance } from "@/lib/blockchain";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  consumeSponsorshipBudget,
  DAILY_SPONSORED_LIMIT,
  isSponsorshipConfigured,
  resolveWalletId,
  sendSponsored,
} from "@/lib/privy-server";
import { ethers } from "ethers";

export const maxDuration = 10;

const ERC1155_IFACE = new ethers.Interface([
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
]);

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    // Returning a selection is one user action spread over one request per
    // card, so the per-minute ceiling is the batch size rather than ADR-006's
    // five. The real ceiling is unchanged and sits below: consumeSponsorshipBudget
    // allows DAILY_SPONSORED_LIMIT sponsored sends per user per day.
    const rate = await checkRateLimit(userId, "privy_import", DAILY_SPONSORED_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many import attempts. Try again in a minute." },
        { status: 429 }
      );
    }

    const { cardId, tokenId } = await request.json();
    if (!cardId && tokenId === undefined) {
      return NextResponse.json({ error: "cardId (or tokenId) is required" }, { status: 400 });
    }

    if (!isSponsorshipConfigured()) {
      return NextResponse.json(
        { error: "Wallet import is not available right now." },
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
        { error: "This card is not currently in your wallet." },
        { status: 400 }
      );
    }
    if (card.exportClaimStatus !== "confirmed") {
      return NextResponse.json(
        { error: "Finish claiming this card in your wallet before returning it." },
        { status: 409 }
      );
    }

    if (card.importTxId) {
      return NextResponse.json({
        success: true,
        alreadyImporting: true,
        importTxId: card.importTxId,
        importTxHash: card.importTxHash ?? null,
      });
    }

    const privyAddress: string = card.privyWalletAddress ?? user.privyWalletAddress;
    if (!privyAddress) {
      return NextResponse.json({ error: "No self-custody wallet on file." }, { status: 400 });
    }

    // Trust the chain over the database. If the card is not actually in the
    // wallet, the transfer would revert and we would have spent a sponsored
    // transaction finding out.
    const held = await getBalance(privyAddress, Number(card.tokenId));
    if (held === 0n) {
      return NextResponse.json(
        { error: "This card is no longer in your wallet." },
        { status: 409 }
      );
    }

    let walletId: string | null = user.privyWalletId ?? null;
    if (!walletId) {
      walletId = await resolveWalletId(privyAddress, user.privyUserId);
      if (!walletId) {
        return NextResponse.json(
          { error: "Could not locate the self-custody wallet." },
          { status: 400 }
        );
      }
      const usersCollection = await getCollection("users");
      await usersCollection.updateOne({ _id: user._id }, { $set: { privyWalletId: walletId } });
    }

    const budget = await consumeSponsorshipBudget(userId);
    if (!budget.allowed) {
      return NextResponse.json(
        { error: "Daily limit for sponsored transactions reached. Try again tomorrow." },
        { status: 429 }
      );
    }

    const data = ERC1155_IFACE.encodeFunctionData("safeTransferFrom", [
      ethers.getAddress(privyAddress),
      ethers.getAddress(user.walletAddress),
      Number(card.tokenId),
      1,
      "0x",
    ]);

    // No retry: an error here can accompany a transfer that landed.
    const sent = await sendSponsored(walletId, {
      to: process.env.CONTRACT_ADDRESS!.trim(),
      data,
    });

    // Recorded so the return appears in the user's history. Without this the
    // history shows a card leaving and never coming back, which reads like
    // something went wrong.
    const txCollection = await getCollection("transactions");
    await txCollection.insertOne({
      userId,
      type: "privy_import",
      tokenId: Number(card.tokenId),
      tokenIds: [Number(card.tokenId)],
      rarity: card.rarity ?? 0,
      templateIds: [card.templateId],
      privyTxId: sent.transactionId,
      txHash: null,
      status: "pending",
      contractAddress: process.env.CONTRACT_ADDRESS!,
      fromAddress: privyAddress,
      toAddress: user.walletAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cardsCollection.updateOne(
      { _id: card._id },
      {
        $set: {
          importTxId: sent.transactionId,
          importUserOpHash: sent.userOperationHash,
          importStatus: "pending",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      importTxId: sent.transactionId,
      remainingToday: budget.remaining,
    });
  } catch (error) {
    console.error("[privy/import] failed:", error);
    return NextResponse.json({ error: "Return failed. Please try again." }, { status: 500 });
  }
}
