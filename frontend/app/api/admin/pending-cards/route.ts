import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";

/**
 * GET /api/admin/pending-cards
 * Returns cards with status "pending" (tokenId: null) along with pending duration.
 * Used to monitor stuck mint transactions.
 */
export async function GET() {
  try {
    const cardsCollection = await getCollection("cards");
    const txCollection = await getCollection("transactions");
    const usersCollection = await getCollection("users");

    // Find all pending cards (no tokenId assigned)
    const pendingCards = await cardsCollection
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .toArray();

    // Get related transactions
    const txIds = [...new Set(pendingCards.map((c) => c.txId).filter(Boolean))];
    const parsedTxIds = txIds.map((id) => parseObjectId(id)).filter(Boolean);
    const txs = parsedTxIds.length > 0
      ? await txCollection.find({ _id: { $in: parsedTxIds } }).toArray()
      : [];
    const txMap = new Map(txs.map((tx) => [tx._id.toString(), tx]));

    // Get all users for address → username mapping
    const users = await usersCollection.find({}).toArray();
    const addressToUsername = new Map<string, string>();
    for (const u of users) {
      if (u.walletAddress) {
        addressToUsername.set(u.walletAddress.toLowerCase(), `@${u.username}`);
      }
    }

    const now = Date.now();
    const RARITY_LABELS = ["Common", "Rare", "Epic", "Legendary"];

    const result = pendingCards.map((card) => {
      const createdAt = new Date(card.createdAt).getTime();
      const pendingMs = now - createdAt;
      const pendingMinutes = Math.floor(pendingMs / 60000);
      const pendingHours = Math.floor(pendingMs / 3600000);

      let durationLabel: string;
      if (pendingMinutes < 1) durationLabel = "Just now";
      else if (pendingMinutes < 60) durationLabel = `${pendingMinutes}m`;
      else if (pendingHours < 24) durationLabel = `${pendingHours}h ${pendingMinutes % 60}m`;
      else durationLabel = `${Math.floor(pendingHours / 24)}d ${pendingHours % 24}h`;

      const tx = card.txId ? txMap.get(card.txId) : null;

      return {
        cardId: card.cardId || null,
        tokenId: card.tokenId,
        templateId: card.templateId,
        rarity: RARITY_LABELS[card.rarity] || `?${card.rarity}`,
        rarityCode: card.rarity,
        ownerAddress: card.ownerAddress,
        ownerUsername: card.ownerAddress ? addressToUsername.get(card.ownerAddress.toLowerCase()) || null : null,
        txId: card.txId || null,
        txHash: tx?.txHash || null,
        txStatus: tx?.status || "unknown",
        createdAt: card.createdAt,
        pendingMs,
        pendingDuration: durationLabel,
        isStale: pendingMs > 60000, // > 1 minute
      };
    });

    const staleCount = result.filter((c) => c.isStale).length;
    const avgPendingMs = result.length > 0
      ? Math.round(result.reduce((sum, c) => sum + c.pendingMs, 0) / result.length)
      : 0;

    return NextResponse.json(
      {
        total: result.length,
        staleCount,
        avgPendingMinutes: Math.round(avgPendingMs / 60000),
        cards: result,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Pending cards error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
