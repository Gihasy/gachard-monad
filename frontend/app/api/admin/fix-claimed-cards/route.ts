import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

/**
 * POST /api/admin/fix-claimed-cards
 * Fix cards that were redeemed but still have fulfillmentStatus: "Real".
 * Also marks corresponding redeem_codes as "claimed" with redeemer info.
 */
export async function POST() {
  try {
    const cardsCollection = await getCollection("cards");
    const txCollection = await getCollection("transactions");
    const codesCollection = await getCollection("redeem_codes");

    // Find cards where status is Digital but fulfillmentStatus is still "Real"
    // These are cards that were redeemed but the fulfillmentStatus wasn't cleared
    const stuckCards = await cardsCollection
      .find({ status: "Digital", fulfillmentStatus: "Real" })
      .toArray();

    const results: string[] = [];

    for (const card of stuckCards) {
      // Find the redeem transaction for this card
      const redeemTx = await txCollection.findOne({
        tokenId: card.tokenId,
        type: "redeem",
        status: "confirmed",
      });

      if (redeemTx) {
        // Clear fulfillmentStatus
        await cardsCollection.updateOne(
          { _id: card._id },
          {
            $set: {
              fulfillmentStatus: null,
              updatedAt: new Date().toISOString(),
            },
            $unset: { deliveredAt: "", claimId: "" },
          }
        );

        // Mark redeem code as claimed with redeemer info
        await codesCollection.updateMany(
          { tokenId: card.tokenId },
          {
            $set: {
              status: "claimed",
              redeemedBy: redeemTx.userId,
              redeemedAt: redeemTx.createdAt,
            },
          }
        );

        results.push(
          `Card tokenId ${card.tokenId}: fulfillmentStatus cleared, code marked as claimed by userId ${redeemTx.userId}`
        );
      }
    }

    return NextResponse.json({
      fixed: results.length,
      results,
    });
  } catch (error) {
    console.error("Fix claimed cards error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
