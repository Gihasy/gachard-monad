import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

// GET: fetch wishlist counts for multiple cardIds
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cardIdsParam = searchParams.get("cardIds");
    if (!cardIdsParam) {
      return NextResponse.json({ stats: {} });
    }

    const cardIds = cardIdsParam.split(",");
    const statsCol = await getCollection("wishlist_stats");
    const stats = await statsCol.find({ cardId: { $in: cardIds } }).toArray();

    const result: Record<string, number> = {};
    for (const s of stats) {
      result[s.cardId] = s.count || 0;
    }
    return NextResponse.json({ stats: result });
  } catch (error) {
    console.error("[wishlist-stats GET]", error);
    return NextResponse.json({ stats: {} });
  }
}

// POST: update wishlist count (increment or decrement)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cardId, action } = body; // action: "add" | "remove"

    if (!cardId || !["add", "remove"].includes(action)) {
      return NextResponse.json({ error: "cardId and action (add/remove) required" }, { status: 400 });
    }

    const statsCol = await getCollection("wishlist_stats");
    const increment = action === "add" ? 1 : -1;

    await statsCol.updateOne(
      { cardId },
      {
        $inc: { count: increment },
        $setOnInsert: { cardId, createdAt: new Date().toISOString() },
        $set: { updatedAt: new Date().toISOString() },
      },
      { upsert: true }
    );

    // Ensure count doesn't go below 0
    await statsCol.updateOne({ cardId, count: { $lt: 0 } }, { $set: { count: 0 } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[wishlist-stats POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
