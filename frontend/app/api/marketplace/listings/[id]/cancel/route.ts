import { NextRequest, NextResponse } from "next/server";
import { getListingById, cancelListing } from "@/lib/listings";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = user._id.toString();

    const listing = await getListingById(id);
    if (!listing) {
      // Listing document missing — clean up stale card reference so user isn't stuck
      const cardsCol = await getCollection("cards");
      await cardsCol.updateMany(
        { listingId: id },
        { $set: { isListed: false }, $unset: { listingId: "" } }
      );
      return NextResponse.json({ success: true, cleaned: true });
    }

    if (listing.sellerId !== userId) {
      return NextResponse.json({ error: "Only the seller can cancel" }, { status: 403 });
    }

    if (listing.status !== "active") {
      return NextResponse.json({ error: "Listing is not active" }, { status: 400 });
    }

    const success = await cancelListing(id, userId);
    if (!success) {
      return NextResponse.json({ error: "Failed to cancel listing" }, { status: 500 });
    }

    const cardsCol = await getCollection("cards");
    // Single update covering both cardId match and listingId match
    await cardsCol.updateMany(
      { $or: [{ cardId: listing.cardId }, { listingId: id }] },
      { $set: { isListed: false }, $unset: { listingId: "" } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[marketplace/cancel]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
