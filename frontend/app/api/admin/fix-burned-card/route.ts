import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

/**
 * Fix: find all cards with confirmed dismantle transactions but status != "Burned",
 * and restore their status to "Burned".
 */
export async function POST() {
  try {
    const cardsCollection = await getCollection("cards");
    const txCollection = await getCollection("transactions");

    // Find all dismantle transactions
    const dismantleTxs = await txCollection.find({ type: "dismantled" }).toArray();
    const dismantledTokenIds = dismantleTxs.flatMap((tx) =>
      tx.tokenIds?.length ? tx.tokenIds : (tx.tokenId != null ? [tx.tokenId] : [])
    );

    // Find cards with those tokenIds that are NOT marked as Burned
    const results: string[] = [];
    for (const tokenId of dismantledTokenIds) {
      const card = await cardsCollection.findOne({ tokenId });
      if (card && card.status !== "Burned") {
        await cardsCollection.updateOne(
          { _id: card._id },
          {
            $set: {
              status: "Burned",
              fulfillmentStatus: null,
              burnedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            $unset: { deliveredAt: "", claimId: "" },
          }
        );
        results.push(`Fixed ${card.cardId} (tokenId ${tokenId}): ${card.status} → Burned`);
      }
    }

    return NextResponse.json({
      success: true,
      fixed: results.length,
      details: results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
