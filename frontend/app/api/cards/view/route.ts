import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";

/**
 * POST /api/cards/view
 * Mark cards as viewed (removes "New" badge).
 * Body: { cardIds?: string[] }
 * If cardIds omitted, marks ALL user's cards as viewed.
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const { cardIds } = await request.json();

    const cardsCollection = await getCollection("cards");

    const filter: Record<string, unknown> = { ownerAddress: user.walletAddress, viewed: { $ne: true } };
    if (cardIds && cardIds.length > 0) {
      filter.cardId = { $in: cardIds };
    }

    const result = await cardsCollection.updateMany(filter, {
      $set: { viewed: true },
    });

    return NextResponse.json({ modified: result.modifiedCount });
  } catch (error) {
    console.error("Mark cards viewed error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
