/**
 * Send an exported card from the user's wallet to any address (ADR-031).
 *
 * This is the exit. Once a card goes to an address Gachard does not know,
 * nothing here can bring it back: the destination is not a Privy wallet this
 * app has signing rights on, so import has nothing to work with. The card is
 * marked Released and stops being actionable, which is the honest record of
 * what happened rather than leaving it looking recoverable.
 *
 * The transfer is executed server-side through the signer the user delegated,
 * so Privy pays the gas. The user chose the destination; the server only
 * carries it out.
 */
import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { getBalance } from "@/lib/blockchain";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  consumeSponsorshipBudget,
  isSponsorshipConfigured,
  needsDelegation,
  resolveWallet,
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

    const rate = await checkRateLimit(userId, "privy_send");
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a minute." },
        { status: 429 }
      );
    }

    const { cardId, to } = await request.json();
    if (!cardId || !to) {
      return NextResponse.json({ error: "cardId and to are required" }, { status: 400 });
    }

    let destination: string;
    try {
      destination = ethers.getAddress(String(to).trim());
    } catch {
      return NextResponse.json({ error: "That does not look like a valid address." }, { status: 400 });
    }
    if (destination === ethers.ZeroAddress) {
      return NextResponse.json({ error: "That address would destroy the card." }, { status: 400 });
    }
    if (destination.toLowerCase() === String(user.walletAddress).toLowerCase()) {
      return NextResponse.json(
        { error: "That is your Gachard wallet. Use Return to Gachard instead." },
        { status: 400 }
      );
    }

    if (!isSponsorshipConfigured()) {
      return NextResponse.json({ error: "Not available right now." }, { status: 503 });
    }

    const cardsCollection = await getCollection("cards");
    const card = await cardsCollection.findOne({ cardId });
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
    if (card.importTxId) {
      return NextResponse.json(
        { error: "This card is already on its way back to Gachard." },
        { status: 409 }
      );
    }

    const privyAddress: string = card.privyWalletAddress ?? user.privyWalletAddress;
    if (!privyAddress) {
      return NextResponse.json({ error: "No self-custody wallet on file." }, { status: 400 });
    }
    if (destination.toLowerCase() === privyAddress.toLowerCase()) {
      return NextResponse.json({ error: "The card is already in that wallet." }, { status: 400 });
    }

    // Chain over database: if the card is not there, the transfer would revert
    // and a sponsored transaction would be spent finding out.
    if ((await getBalance(privyAddress, Number(card.tokenId))) === 0n) {
      return NextResponse.json(
        { error: "This card is no longer in your wallet." },
        { status: 409 }
      );
    }

    const resolved = await resolveWallet(privyAddress, user.privyUserId);
    if (!resolved?.id || needsDelegation(resolved)) {
      return NextResponse.json(
        { error: "Allow Gachard to act on your wallet first.", code: "needs_delegation" },
        { status: 409 }
      );
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
      destination,
      Number(card.tokenId),
      1,
      "0x",
    ]);

    // No retry: an error here can accompany a transfer that landed.
    const sent = await sendSponsored(resolved.id, {
      to: process.env.CONTRACT_ADDRESS!.trim(),
      data,
    });

    const txCollection = await getCollection("transactions");
    await txCollection.insertOne({
      userId,
      type: "privy_send",
      tokenId: Number(card.tokenId),
      tokenIds: [Number(card.tokenId)],
      rarity: card.rarity ?? 0,
      templateIds: [card.templateId],
      privyTxId: sent.transactionId,
      txHash: null,
      status: "pending",
      contractAddress: process.env.CONTRACT_ADDRESS!,
      fromAddress: privyAddress,
      toAddress: destination,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await cardsCollection.updateOne(
      { _id: card._id },
      {
        $set: {
          status: "Released",
          releasedTo: destination,
          releaseTxId: sent.transactionId,
          releasedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      to: destination,
      releaseTxId: sent.transactionId,
      remainingToday: budget.remaining,
    });
  } catch (error) {
    console.error("[privy/send] failed:", error);
    return NextResponse.json({ error: "Send failed. Please try again." }, { status: 500 });
  }
}
