import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getProvider } from "@/lib/blockchain";
import { ethers } from "ethers";

const CARD_STATUS_CHANGED_TOPIC = ethers.id("CardStatusChanged(uint256,uint8,uint8)");
const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

/**
 * POST /api/admin/fix-pending-transactions
 * Re-check all pending/Processing transactions against on-chain receipts.
 * Updates both transaction status and card status.
 */
export async function POST() {
  try {
    const txCollection = await getCollection("transactions");
    const cardsCollection = await getCollection("cards");
    const provider = getProvider();
    const contractAddress = process.env.CONTRACT_ADDRESS?.trim().toLowerCase();

    // Find all pending transactions with a txHash
    const pendingTxs = await txCollection
      .find({ status: { $in: ["pending", "Processing"] }, txHash: { $ne: null } })
      .toArray();

    const results: string[] = [];

    for (const tx of pendingTxs) {
      try {
        const confirmedTokenIds: number[] = [];
        const receipt = await provider.getTransactionReceipt(tx.txHash);
        if (!receipt) {
          results.push(`tx ${tx.txHash.slice(0, 10)}... (${tx.type}): still pending on-chain`);
          continue;
        }

        const success = receipt.status === 1;
        const newStatus = success ? "confirmed" : "failed";

        // Update transaction status
        await txCollection.updateOne(
          { _id: tx._id },
          { $set: { status: newStatus, updatedAt: new Date().toISOString() } }
        );

        if (success && receipt.logs) {
          // Parse events and update card status
          for (const log of receipt.logs) {
            if (log.address.toLowerCase() !== contractAddress) continue;

            if (tx.type === "mint" && log.topics[0] === CARD_MINTED_TOPIC) {
              const tokenId = parseInt(log.topics[1], 16);
              const data = log.data.slice(2);
              const rarity = parseInt(data.slice(64, 128), 16);

              // Find the card by txId and update
              const mintIndex = confirmedTokenIds.length;
              confirmedTokenIds.push(tokenId);

              await cardsCollection.updateOne(
                { txId: tx._id.toString(), pickIndex: mintIndex },
                { $set: { tokenId, status: "Digital", rarity, lastOnChainSync: new Date().toISOString() } }
              );
              results.push(`Card tokenId ${tokenId} (rarity ${rarity}): mint confirmed`);
            } else if (tx.type === "redeem" && log.topics[0] === CARD_STATUS_CHANGED_TOPIC) {
              const tokenId = parseInt(log.topics[1], 16);
              const data = log.data.slice(2);
              const newCardStatus = parseInt(data.slice(64, 128), 16);

              if (newCardStatus === 0) {
                await cardsCollection.updateOne(
                  { tokenId },
                  {
                    $set: {
                      status: "Digital",
                      fulfillmentStatus: null,
                      ownerAddress: tx.toAddress,
                      lastOnChainSync: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                    $unset: { deliveredAt: "", claimId: "" },
                  }
                );
                results.push(`Card tokenId ${tokenId}: Real → Digital (redeem confirmed)`);
              }
            } else if (tx.type === "print" && log.topics[0] === CARD_STATUS_CHANGED_TOPIC) {
              const tokenId = parseInt(log.topics[1], 16);
              const data = log.data.slice(2);
              const newCardStatus = parseInt(data.slice(64, 128), 16);

              if (newCardStatus === 1) {
                await cardsCollection.updateOne(
                  { tokenId },
                  {
                    $set: {
                      status: "Vaulted",
                      lastOnChainSync: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    },
                  }
                );
                results.push(`Card tokenId ${tokenId}: → Vaulted (print confirmed)`);
              }
            }
          }
        }

        results.push(`tx ${tx.txHash.slice(0, 10)}... (${tx.type}): ${newStatus}`);
      } catch (err) {
        results.push(`tx ${tx.txHash.slice(0, 10)}... (${tx.type}): error - ${String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed: pendingTxs.length,
      details: results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
