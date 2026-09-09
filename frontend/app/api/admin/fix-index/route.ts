import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";

/**
 * One-time fix: drop tokenId_1 unique index and recreate as non-unique.
 * tokenId uniqueness is guaranteed by on-chain minting — no need for DB constraint.
 * The unique index was blocking pending mints (tokenId: null).
 */
export async function POST() {
  try {
    const cardsCollection = await getCollection("cards");
    const indexes = await cardsCollection.indexes();
    const tokenIdIdx = indexes.find((i) => i.name === "tokenId_1");

    const results: string[] = [];

    if (tokenIdIdx) {
      await cardsCollection.dropIndex("tokenId_1");
      results.push("Dropped tokenId_1 index");
    }

    // Non-unique index for query performance only
    await cardsCollection.createIndex({ tokenId: 1 }, { sparse: true });
    results.push("Created sparse (non-unique) tokenId index");

    // Verify
    const newIndexes = await cardsCollection.indexes();
    const newTokenIdx = newIndexes.find((i) => i.name === "tokenId_1");
    results.push(`Verified: unique=${newTokenIdx?.unique ?? false}, sparse=${newTokenIdx?.sparse ?? false}`);

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
