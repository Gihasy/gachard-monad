import { NextRequest, NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { createListing, getListingById } from "@/lib/listings";
import { getFVM, getFVMFloor, type FVMResult } from "@/lib/fvm";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const body = await req.json();
    const { cardId, price } = body;

    if (!cardId || typeof price !== "number") {
      return NextResponse.json({ error: "Missing required fields: cardId, price" }, { status: 400 });
    }

    if (price <= 0 || !Number.isInteger(price)) {
      return NextResponse.json({ error: "Price must be a positive integer" }, { status: 400 });
    }

    const cardsCol = await getCollection("cards");
    const card = await cardsCol.findOne({ cardId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    if (user.walletAddress !== card.ownerAddress) {
      return NextResponse.json({ error: "You do not own this card" }, { status: 403 });
    }

    if (card.status !== "Digital") {
      return NextResponse.json({ error: "Card must be Digital to list" }, { status: 400 });
    }

    if (card.isListed) {
      // Verify the listing actually exists and is active
      if (card.listingId) {
        const existingListing = await getListingById(card.listingId);
        if (existingListing && existingListing.status === "active") {
          return NextResponse.json({ error: "Card is already listed" }, { status: 400 });
        }
      }
      // Stale reference — clean up and allow listing
      await cardsCol.updateOne(
        { cardId },
        { $set: { isListed: false }, $unset: { listingId: "" } }
      );
    }

    if (card.fulfillmentStatus) {
      return NextResponse.json({ error: "Card with physical print history cannot be listed" }, { status: 400 });
    }

    const fvmResult = await getFVM(card.templateId);
    const floor = getFVMFloor(fvmResult.fvm);
    if (floor !== null && price < floor) {
      return NextResponse.json({
        error: `Price below FVM floor. Minimum: ${floor} Crystal (70% of FVM ${fvmResult.fvm})`,
        floor,
        fvm: fvmResult.fvm,
      }, { status: 400 });
    }

    const listing = await createListing({
      cardId: card.cardId,
      tokenId: card.tokenId,
      templateId: card.templateId,
      sellerId: userId,
      sellerWalletAddress: user.walletAddress,
      price,
    });

    await cardsCol.updateOne(
      { cardId },
      { $set: { isListed: true, listingId: listing.listingId } }
    );

    return NextResponse.json({ listing });
  } catch (error) {
    console.error("[marketplace/listings POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get("templateId") || undefined;

    const listingsCol = await getCollection("listings");
    const query: Record<string, unknown> = { status: "active" };
    if (templateId) query.templateId = templateId;

    const listings = await listingsCol
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const templatesCol = await getCollection("card_templates");
    const uniqueTemplateIds = [...new Set(listings.map((l) => l.templateId))];
    const templates = uniqueTemplateIds.length > 0
      ? await templatesCol.find({ templateId: { $in: uniqueTemplateIds } }).toArray()
      : [];
    const templateMap = new Map(templates.map((t) => [t.templateId, t]));

    // Batch FVM: fetch all sold transactions once, compute in-memory
    const txCol = await getCollection("transactions");
    const soldTxs = await txCol
      .find({ type: "sold", status: "confirmed", templateId: { $in: uniqueTemplateIds } })
      .toArray();

    const soldByTemplate = new Map<string, number[]>();
    for (const tx of soldTxs) {
      if (!soldByTemplate.has(tx.templateId)) soldByTemplate.set(tx.templateId, []);
      soldByTemplate.get(tx.templateId)!.push(tx.amount || 0);
    }

    // For templates with no direct sales, gather rarity-level sales
    const templatesWithSales = new Set(soldByTemplate.keys());
    const missingTemplateIds = uniqueTemplateIds.filter((id) => !templatesWithSales.has(id));
    const missingRarities = new Set<number>();
    for (const id of missingTemplateIds) {
      const t = templateMap.get(id);
      if (t) missingRarities.add(t.rarity);
    }
    const raritySoldTxs = missingRarities.size > 0
      ? await txCol.find({ type: "sold", status: "confirmed", rarity: { $in: [...missingRarities] } }).toArray()
      : [];
    const soldByRarity = new Map<number, number[]>();
    for (const tx of raritySoldTxs) {
      if (tx.rarity == null) continue;
      if (!soldByRarity.has(tx.rarity)) soldByRarity.set(tx.rarity, []);
      soldByRarity.get(tx.rarity)!.push(tx.amount || 0);
    }

    const enriched = listings.map((listing) => {
      const template = templateMap.get(listing.templateId);
      let fvm: number | null = null;
      let fvmSource: FVMResult["source"] = "none";

      const directSales = soldByTemplate.get(listing.templateId);
      if (directSales && directSales.length > 0) {
        fvm = Math.round(directSales.reduce((s, v) => s + v, 0) / directSales.length);
        fvmSource = "template";
      } else if (template) {
        const raritySales = soldByRarity.get(template.rarity);
        if (raritySales && raritySales.length > 0) {
          fvm = Math.round(raritySales.reduce((s, v) => s + v, 0) / raritySales.length);
          fvmSource = "rarity";
        }
      }

      return {
        ...listing,
        artworkUrl: template?.artworkUrl || null,
        templateName: template?.name || listing.templateId,
        rarity: template?.rarity ?? 0,
        fvm,
        fvmSource,
      };
    });

    return NextResponse.json({ listings: enriched });
  } catch (error) {
    console.error("[marketplace/listings GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
