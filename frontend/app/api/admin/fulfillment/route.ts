import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCollection } from "@/lib/mongodb";
import { isUnlockedAdmin } from "@/lib/admin-tier";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Advance a card through the print queue: Locked, Processing, Printed,
 * Shipping. The last step to Real happens when the owner claims the shipment.
 *
 * Who may call it (since 19 October 2026): an unlocked admin, for any card, or
 * the signed-in owner of the card, for their own. The owner path exists so a
 * judge can request a print and walk the card through the queue without the
 * admin password. Anyone else gets a refusal that says why, not a bare 401.
 * The proxy lets this route through on purpose (OWNER_OR_ADMIN in proxy.ts).
 */

const VALID_TRANSITIONS: Record<string, string> = {
  Locked: "Processing",
  Processing: "Printed",
  Printed: "Shipping",
  Shipping: "Real",
};

export async function POST(request: Request) {
  try {
    const admin = isUnlockedAdmin(request);
    const user = admin ? null : await getAuthenticatedUser(request);
    if (!admin && !user) {
      return NextResponse.json(
        { error: "Sign in to advance your own print request, or unlock the console as an admin.", code: "sign_in" },
        { status: 401 }
      );
    }
    if (user) {
      const rate = await checkRateLimit(user._id.toString(), "fulfillment");
      if (!rate.allowed) {
        return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
      }
    }

    const { tokenId, action, trackingNumber } = await request.json();

    if (!tokenId || !action) {
      return NextResponse.json({ error: "tokenId and action required" }, { status: 400 });
    }

    const cardsCollection = await getCollection("cards");
    const card = await cardsCollection.findOne({ tokenId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const ownsCard =
      !!user &&
      typeof card.ownerAddress === "string" &&
      typeof user.walletAddress === "string" &&
      card.ownerAddress.toLowerCase() === user.walletAddress.toLowerCase();
    if (!admin && !ownsCard) {
      return NextResponse.json(
        { error: "Only the card's owner or an admin can advance this print request.", code: "not_owner" },
        { status: 403 }
      );
    }

    const currentStatus = card.fulfillmentStatus;
    const expectedAction = VALID_TRANSITIONS[currentStatus];

    if (!expectedAction || action !== expectedAction) {
      return NextResponse.json(
        { error: `Invalid transition: ${currentStatus} → ${action}` },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = {
      fulfillmentStatus: action,
      updatedAt: new Date().toISOString(),
    };

    // Add tracking number and generate claimId for Shipping status
    if (action === "Shipping") {
      if (trackingNumber) update.trackingNumber = trackingNumber;
      update.claimId = randomBytes(4).toString("hex");
    }

    // If status is "Real", also update card status to "Real" (final state)
    if (action === "Real") {
      update.status = "Real";
      update.deliveredAt = new Date().toISOString();
    }

    await cardsCollection.updateOne({ tokenId }, { $set: update });

    // If status is "Real", also mark redeem code as accepted
    if (action === "Real") {
      const codesCollection = await getCollection("redeem_codes");
      await codesCollection.updateMany(
        { tokenId },
        {
          $set: {
            status: "accepted",
            acceptedAt: new Date().toISOString(),
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      tokenId,
      fulfillmentStatus: action,
    });
  } catch (error) {
    console.error("Fulfillment update error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
