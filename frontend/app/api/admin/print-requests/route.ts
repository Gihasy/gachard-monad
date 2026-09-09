import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { decrypt } from "@/lib/crypto";
import { generateInvoiceId } from "@/lib/invoice";

/**
 * Admin endpoint: list all print requests with decrypted redeem codes.
 */
export async function GET() {
  try {
    const txCollection = await getCollection("transactions");
    const codesCollection = await getCollection("redeem_codes");
    const usersCollection = await getCollection("users");
    const cardsCollection = await getCollection("cards");
    const shippingCollection = await getCollection("shipping_addresses");

    // Get all print transactions
    const printTxs = await txCollection
      .find({ type: "print" })
      .sort({ createdAt: -1 })
      .toArray();

    const results = await Promise.all(
      printTxs.map(async (tx) => {
        // Get redeem code
        const codeDoc = await codesCollection.findOne({
          txId: tx._id.toString(),
        });

        let redeemCode: string | null = null;
        let codeStatus: string | null = null;
        if (codeDoc) {
          try {
            redeemCode = decrypt(codeDoc.codeEncrypted);
            codeStatus = codeDoc.status;
          } catch {
            redeemCode = "[decrypt error]";
            codeStatus = codeDoc.status;
          }
        }

        // Get user info
        const user = await usersCollection.findOne({
          _id: new (await import("mongodb").then((m) => m.ObjectId))(tx.userId),
        } as Record<string, unknown>);

        // Get card info
        const card = await cardsCollection.findOne({ tokenId: tx.tokenId });

        // Get shipping address
        const shipping = await shippingCollection.findOne({
          userId: tx.userId,
          tokenId: tx.tokenId,
        });

        // Check if already accepted
        const accepted = await codesCollection.findOne({
          txId: tx._id.toString(),
          status: "accepted",
        });

        // Get redeemer info if code was claimed
        let redeemer: { username: string; walletAddress: string } | null = null;
        if (codeDoc?.status === "claimed" && codeDoc?.redeemedBy) {
          try {
            const { ObjectId } = await import("mongodb");
            const redeemerDoc = await usersCollection.findOne({ _id: new ObjectId(codeDoc.redeemedBy) } as Record<string, unknown>);
            if (redeemerDoc) {
              redeemer = {
                username: redeemerDoc.username,
                walletAddress: redeemerDoc.walletAddress,
              };
            }
          } catch { /* ignore */ }
        }

        return {
          txId: generateInvoiceId(tx._id.toString()),
          rawTxId: tx._id.toString(),
          tokenId: tx.tokenId,
          redeemCode,
          codeStatus,
          accepted: !!accepted,
          redeemer,
          fulfillmentStatus: card?.fulfillmentStatus || null,
          shippingAddress: shipping
            ? {
                recipientName: shipping.recipientName,
                addressLine1: shipping.addressLine1,
                addressLine2: shipping.addressLine2 || "",
                city: shipping.city,
                postalCode: shipping.postalCode,
                phone: shipping.phone,
              }
            : null,
          user: user
            ? {
                email: user.email,
                username: user.username,
                walletAddress: user.walletAddress,
              }
            : null,
          card: card
            ? {
                cardId: card.cardId || null,
                claimId: card.claimId || null,
                status: card.status,
                rarity: card.rarity,
                templateId: card.templateId,
                fulfillmentStatus: card.fulfillmentStatus || null,
              }
            : null,
          txStatus: tx.status,
          createdAt: tx.createdAt,
          updatedAt: tx.updatedAt,
        };
      })
    );

    return NextResponse.json(
      { printRequests: results },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    console.error("Admin print-requests error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500, headers: { "Cache-Control": "no-store, private" } });
  }
}
