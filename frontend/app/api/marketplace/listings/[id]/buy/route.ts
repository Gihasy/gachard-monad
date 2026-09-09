import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ObjectId } from "mongodb";
import { getListingById, markListingSold } from "@/lib/listings";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getAuthenticatedUser } from "@/lib/session";
import { deductCrystal, addCrystal } from "@/lib/crystal";
import { marketplaceTransfer, waitForReceipt, recordVerification } from "@/lib/blockchain";
import { calculateTradeSignals } from "@/lib/fraud-signals";
import { calculateRiskScore } from "@/lib/risk-score";

const MARKETPLACE_FEE_PERCENT = 8;

export const maxDuration = 15;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const buyer = await getAuthenticatedUser(req);
    if (!buyer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = buyer._id.toString();

    const listing = await getListingById(id);
    if (!listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }
    if (listing.status !== "active") {
      return NextResponse.json({ error: "Listing is no longer active" }, { status: 400 });
    }
    if (listing.sellerId === userId) {
      return NextResponse.json({ error: "Cannot buy your own listing" }, { status: 400 });
    }

    // Get card for rarity
    const cardsCol = await getCollection("cards");
    const card = await cardsCol.findOne({ cardId: listing.cardId });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Deduct credits from buyer
    try {
      await deductCrystal(userId, listing.price);
    } catch {
      return NextResponse.json({ error: "Insufficient crystal balance" }, { status: 400 });
    }

    // Mark listing as sold (atomic — only if still active)
    const soldListing = await markListingSold(id, userId);
    if (!soldListing) {
      await addCrystal(userId, listing.price);
      return NextResponse.json({ error: "Listing was just sold to someone else" }, { status: 409 });
    }

    // On-chain transfer
    let txHash: string | null = null;
    try {
      txHash = await marketplaceTransfer(
        listing.tokenId,
        listing.sellerWalletAddress,
        buyer.walletAddress
      );
    } catch (err) {
      console.error("[marketplace/buy] on-chain transfer failed:", err);
      await addCrystal(userId, listing.price);
      await getCollection("listings").then((c) =>
        c.updateOne({ listingId: id }, { $set: { status: "active" }, $unset: { buyerId: "", soldAt: "" } })
      );
      return NextResponse.json({ error: "Blockchain transfer failed. Crystal refunded." }, { status: 500 });
    }

    // Wait for receipt (async pattern — ADR-018)
    let confirmed = false;
    if (txHash) {
      const receipt = await waitForReceipt(txHash, 3, 1000);
      if (receipt && receipt.status === 1) {
        confirmed = true;
      }
    }

    // Record transaction — use ACTUAL rarity from card
    const txCol = await getCollection("transactions");
    const soldTxResult = await txCol.insertOne({
      _id: new ObjectId(),
      userId,
      type: "sold",
      tokenId: listing.tokenId,
      tokenIds: [listing.tokenId],
      rarity: card.rarity ?? 0,
      rarities: [card.rarity ?? 0],
      templateIds: [listing.templateId],
      amount: listing.price,
      purchasePrice: listing.price,
      txHash,
      status: confirmed ? "confirmed" : "pending",
      contractAddress: process.env.CONTRACT_ADDRESS || "",
      fromAddress: listing.sellerWalletAddress,
      toAddress: buyer.walletAddress,
      error: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Post-transaction risk scoring via after() — platform keeps function alive until complete
    after(async () => {
      try {
        const signals = await calculateTradeSignals(
          listing.tokenId,
          buyer.walletAddress,
          listing.sellerWalletAddress,
          listing.price,
          listing.templateId
        );
        const risk = await calculateRiskScore(signals);

        // Update the exact sold transaction by its _id — no time-window guessing
        await txCol.updateOne(
          { _id: soldTxResult.insertedId },
          { $set: { riskScore: risk.riskScore, flagged: risk.flagged, riskReasoning: risk.reasoning } }
        );

        // Post to on-chain oracle
        try {
          await recordVerification(listing.tokenId, risk.riskScore, risk.flagged);
        } catch (err) {
          console.error("[marketplace/buy] on-chain recordVerification failed:", err);
        }
      } catch (err) {
        console.error("[marketplace/buy] risk scoring failed:", err);
      }
    });

    // Record "listed" transaction for seller
    await txCol.insertOne({
      _id: new ObjectId(),
      userId: listing.sellerId,
      type: "listed",
      tokenId: listing.tokenId,
      tokenIds: [listing.tokenId],
      rarity: card.rarity ?? 0,
      rarities: [card.rarity ?? 0],
      templateIds: [listing.templateId],
      amount: listing.price,
      purchasePrice: listing.price,
      txHash: null,
      status: "confirmed",
      contractAddress: "",
      fromAddress: listing.sellerWalletAddress,
      toAddress: "",
      error: "",
      createdAt: listing.createdAt,
      updatedAt: listing.createdAt,
    });

    if (confirmed) {
      // On-chain confirmed — finalize card ownership immediately
      await cardsCol.updateOne(
        { cardId: listing.cardId },
        {
          $set: {
            ownerAddress: buyer.walletAddress,
            isListed: false,
            status: "Digital",
            lastOnChainSync: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          $unset: { listingId: "" },
        }
      );

      const sellerProceeds = Math.round(listing.price * (1 - MARKETPLACE_FEE_PERCENT / 100));
      await addCrystal(listing.sellerId, sellerProceeds);

      return NextResponse.json({
        success: true,
        txHash,
        status: "confirmed",
        sellerProceeds,
        fee: listing.price - sellerProceeds,
      });
    } else {
      // NOT confirmed yet — set card to "pending transfer" state
      await cardsCol.updateOne(
        { cardId: listing.cardId },
        {
          $set: {
            status: "pending",
            isListed: false,
            pendingBuyerId: userId,
            pendingBuyerWallet: buyer.walletAddress,
            pendingSellerId: listing.sellerId,
            pendingListingPrice: listing.price,
            pendingTxHash: txHash,
            updatedAt: new Date().toISOString(),
          },
          $unset: { listingId: "" },
        }
      );

      return NextResponse.json({
        success: true,
        txHash,
        status: "pending",
        message: "Transfer in progress. Card will update shortly.",
      });
    }
  } catch (error) {
    console.error("[marketplace/buy]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
