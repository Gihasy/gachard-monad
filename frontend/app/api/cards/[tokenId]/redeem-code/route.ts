import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { decrypt } from "@/lib/crypto";

const NO_STORE = { "Cache-Control": "no-store, private" };

/**
 * GET /api/cards/[tokenId]/redeem-code — demo mode (19 October 2026).
 *
 * On a real card the redeem code sits under a scratch-off. No physical card
 * has been printed yet, so a judge who requests a print, walks it through the
 * queue and claims the shipment would be stuck: the code exists only in the
 * database. This hands it to the person who would be holding the card.
 *
 * Only to them, and only at that point: a signed-in user, who owns the card,
 * whose card has been claimed (status Real), and whose code has not been used.
 * The cost, recorded in ADR-007's amendment: a card's owner who later passes
 * the physical card on still knows its code. Acceptable on testnet, where the
 * physical card does not exist; not acceptable once cards are really printed.
 *
 * `/api/cards/` is public at the proxy (for the QR route), so this route
 * authenticates for itself.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to see your redeem code." }, { status: 401, headers: NO_STORE });
  }

  const rate = await checkRateLimit(user._id.toString(), "redeem_code_view");
  if (!rate.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: NO_STORE });
  }

  const { tokenId: raw } = await params;
  const tokenId = parseInt(raw, 10);
  if (isNaN(tokenId)) {
    return NextResponse.json({ error: "Invalid tokenId" }, { status: 400, headers: NO_STORE });
  }

  const card = await (await getCollection("cards")).findOne({ tokenId });
  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404, headers: NO_STORE });
  }

  const owns =
    typeof card.ownerAddress === "string" &&
    typeof user.walletAddress === "string" &&
    card.ownerAddress.toLowerCase() === user.walletAddress.toLowerCase();
  if (!owns) {
    return NextResponse.json({ error: "Only the card's owner can see its redeem code." }, { status: 403, headers: NO_STORE });
  }

  if (card.status !== "Real") {
    return NextResponse.json(
      { error: "Claim the shipment first. The code comes with the physical card." },
      { status: 400, headers: NO_STORE }
    );
  }

  const codeDoc = await (await getCollection("redeem_codes")).findOne(
    { tokenId, status: { $in: ["active", "accepted"] } },
    { sort: { createdAt: -1 } }
  );
  if (!codeDoc?.codeEncrypted) {
    return NextResponse.json({ error: "No unused redeem code for this card." }, { status: 404, headers: NO_STORE });
  }

  let code: string;
  try {
    code = decrypt(codeDoc.codeEncrypted);
  } catch {
    return NextResponse.json({ error: "Could not read the redeem code." }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ code, demo: true }, { headers: NO_STORE });
}
