import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { generateInvoiceId } from "@/lib/invoice";

/**
 * POST /api/claim-shipping
 * User claims a shipped card by scanning the claim QR code.
 * Body: { userId, claimId }
 * 
 * Flow:
 * 1. Verify user exists
 * 2. Find card by claimId
 * 3. Verify card belongs to user
 * 4. Update card status to "Real"
 */
export async function POST(request: Request) {
  try {
    const { claimId } = await request.json();

    if (!claimId) {
      return NextResponse.json({ error: "claimId required" }, { status: 400 });
    }

    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    // Find card by claimId
    const cardsCollection = await getCollection("cards");
    const card = await cardsCollection.findOne({ claimId });
    if (!card) {
      return NextResponse.json({ error: "Invalid claim code" }, { status: 404 });
    }

    // Verify card belongs to user
    if (card.ownerAddress !== user.walletAddress) {
      return NextResponse.json({ error: "Card does not belong to this user" }, { status: 403 });
    }

    // Verify card is in Shipping status
    if (card.fulfillmentStatus !== "Shipping") {
      return NextResponse.json(
        { error: `Card is not in Shipping status (current: ${card.fulfillmentStatus || "Digital"})` },
        { status: 400 }
      );
    }

    // Update card to Real
    await cardsCollection.updateOne(
      { claimId },
      {
        $set: {
          status: "Real",
          fulfillmentStatus: "Real",
          deliveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        $unset: { claimId: "" },
      }
    );

    // Record transaction for history
    const txCollection = await getCollection("transactions");
    await txCollection.insertOne({
      userId: user._id.toString(),
      type: "claimed",
      tokenId: card.tokenId,
      tokenIds: [card.tokenId],
      rarity: card.rarity ?? 0,
      rarities: [card.rarity ?? 0],
      templateIds: [card.templateId],
      txHash: null,
      status: "confirmed",
      contractAddress: null,
      fromAddress: "shipping",
      toAddress: user.walletAddress,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      tokenId: card.tokenId,
      cardId: card.cardId,
      status: "Real",
    });
  } catch (error) {
    console.error("Claim shipping error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
