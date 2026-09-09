import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { confirmTransaction } from "@/lib/transactions";
import { getAuthenticatedUser } from "@/lib/session";

/**
 * Derive user-facing display status from fulfillmentStatus.
 * fulfillmentStatus drives the label — not the on-chain card.status.
 */
function getDisplayStatus(fulfillmentStatus: string | null | undefined, cardStatus?: string): string {
  if (cardStatus === "Burned") return "Burned";
  if (!fulfillmentStatus) return "Digital";
  if (["Locked", "Processing", "Printed"].includes(fulfillmentStatus)) return "In Progress";
  if (fulfillmentStatus === "Shipping") return "Shipping";
  if (fulfillmentStatus === "Real") return "Physical";
  return "Digital";
}

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const cardsCollection = await getCollection("cards");
    const templatesCollection = await getCollection("card_templates");

    // Auto-reconciliation: confirm pending transactions for this user's cards
    const txCollection = await getCollection("transactions");
    const pendingTxs = await txCollection
      .find({ userId, status: "pending", txHash: { $ne: null } })
      .toArray();

    if (pendingTxs.length > 0) {
      await Promise.allSettled(
        pendingTxs.map((tx) => confirmTransaction(tx._id.toString()))
      );
    }

    // Fetch cards (possibly updated by reconciliation above)
    const cards = await cardsCollection
      .find({ ownerAddress: user.walletAddress })
      .sort({ createdAt: -1 })
      .toArray();

    // Only fetch templates that match user's cards (not all templates)
    const uniqueTemplateIds = [...new Set(cards.map((c) => c.templateId))];
    const templates = uniqueTemplateIds.length > 0
      ? await templatesCollection.find({ templateId: { $in: uniqueTemplateIds } }).toArray()
      : [];
    const templateMap = new Map(templates.map((t) => [t.templateId, t]));

    // Fetch listing prices for listed cards
    const listedCardIds = cards.filter(c => c.isListed && c.listingId).map(c => c.listingId);
    const listingsCollection = await getCollection("listings");
    const listings = listedCardIds.length > 0
      ? await listingsCollection.find({ listingId: { $in: listedCardIds }, status: "active" }).toArray()
      : [];
    const listingPriceMap = new Map(listings.map((l) => [l.listingId, l.price]));

    const enrichedCards = cards.map((card) => {
      const template = templateMap.get(card.templateId);
      return {
        cardId: card.cardId || null,
        tokenId: card.tokenId,
        templateId: card.templateId,
        rarity: card.rarity,
        displayStatus: getDisplayStatus(card.fulfillmentStatus, card.status),
        artworkUrl: template?.artworkUrl || "",
        templateName: template?.name || card.templateId,
        requestedAt: card.fulfillmentStatus ? card.updatedAt || null : null,
        deliveredAt: card.deliveredAt || null,
        claimId: card.claimId || null,
        isNew: !card.viewed,
        isListed: card.isListed || false,
        listingId: card.listingId || null,
        listingPrice: card.listingId ? listingPriceMap.get(card.listingId) || null : null,
        createdAt: card.createdAt || null,
      };
    });

    return NextResponse.json({ cards: enrichedCards });
  } catch (error) {
    console.error("Get cards error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
