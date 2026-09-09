import { NextResponse } from "next/server";
import { after } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { burnCard, waitForReceipt } from "@/lib/blockchain";
import { addCrystal, getDismantleRate } from "@/lib/crystal";
import { generateInvoiceId } from "@/lib/invoice";

export const maxDuration = 15;

const RARITY_NAMES = ["Common", "Rare", "Epic", "Legendary"];

export async function POST(request: Request) {
  try {
    const { cardId, tokenId } = await request.json();

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    if (!cardId && tokenId === undefined) {
      return NextResponse.json({ error: "cardId (or tokenId) is required" }, { status: 400 });
    }

    // Get card — prefer cardId, fallback to tokenId
    const cardsCollection = await getCollection("cards");
    const card = cardId
      ? await cardsCollection.findOne({ cardId })
      : await cardsCollection.findOne({ tokenId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Resolve the canonical identifier from the query result — NOT from request body
    // (cardId from body could be undefined if only tokenId was sent)
    const resolvedCardId = card.cardId ?? card._id.toString();

    // Verify ownership
    if (card.ownerAddress !== user.walletAddress) {
      return NextResponse.json({ error: "Card does not belong to this user" }, { status: 403 });
    }

    // Validate card state: must be Digital, not listed, not in fulfillment
    if (card.status !== "Digital") {
      return NextResponse.json({ error: "Only Digital cards can be dismantled" }, { status: 400 });
    }
    if (card.isListed) {
      return NextResponse.json({ error: "Card is listed for sale. Cancel listing before dismantling." }, { status: 400 });
    }
    if (card.fulfillmentStatus) {
      return NextResponse.json({ error: "Card is in fulfillment process and cannot be dismantled" }, { status: 400 });
    }

    // Calculate Crystal reward
    const rarity = card.rarity ?? 0;
    const crystalReward = getDismantleRate(rarity);
    if (crystalReward === 0) {
      return NextResponse.json({ error: "Invalid card rarity" }, { status: 400 });
    }

    // Burn on-chain
    const txHash = await burnCard(card.tokenId, user.walletAddress);

    // Record transaction as pending
    const contractAddress = process.env.CONTRACT_ADDRESS!;
    const txCollection = await getCollection("transactions");
    const txResult = await txCollection.insertOne({
      userId: user._id.toString(),
      type: "dismantled",
      tokenId: card.tokenId,
      tokenIds: [card.tokenId],
      rarity,
      rarities: [rarity],
      templateIds: [card.templateId],
      txHash,
      status: "pending",
      contractAddress,
      fromAddress: user.walletAddress,
      toAddress: "0x0000000000000000000000000000000000000000",
      amount: crystalReward,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Mark card as Burned and credit Crystal in parallel
    const [, newBalance] = await Promise.all([
      cardsCollection.updateOne(
        { cardId: resolvedCardId },
        {
          $set: {
            status: "Burned",
            burnedAt: new Date().toISOString(),
            dismantleTxId: txResult.insertedId.toString(),
            crystalReward,
            updatedAt: new Date().toISOString(),
          },
        }
      ),
      addCrystal(user._id.toString(), crystalReward),
    ]);

    // Background: wait for on-chain receipt and confirm transaction
    // Uses after() from next/server — same pattern as marketplace buy route
    // Response returns immediately with "pending" status
    after(async () => {
      try {
        const receipt = await waitForReceipt(txHash);
        if (receipt && receipt.status === 1) {
          await txCollection.updateOne(
            { _id: txResult.insertedId },
            { $set: { status: "confirmed", updatedAt: new Date().toISOString() } }
          );
        } else {
          await txCollection.updateOne(
            { _id: txResult.insertedId },
            { $set: { status: "failed", error: "On-chain transaction failed or timed out", updatedAt: new Date().toISOString() } }
          );
        }
      } catch (err) {
        console.error("[dismantle] background receipt confirmation failed:", err);
      }
    });

    return NextResponse.json({
      status: "pending",
      txId: generateInvoiceId(txResult.insertedId.toString()),
      crystalReward,
      crystalBalance: newBalance,
      rarity: RARITY_NAMES[rarity],
    });
  } catch (error) {
    console.error("Dismantle error:", error);
    return NextResponse.json({ error: "Dismantle failed" }, { status: 500 });
  }
}
