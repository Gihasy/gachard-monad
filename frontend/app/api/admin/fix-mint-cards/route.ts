import { NextResponse } from "next/server";
import { getCollection, parseObjectId } from "@/lib/mongodb";
import { getProvider } from "@/lib/blockchain";
import { ethers } from "ethers";

const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");

/**
 * POST /api/admin/fix-mint-cards
 * Fix pending mint cards by checking on-chain CardMinted events.
 */
export async function POST() {
  try {
    const provider = getProvider();
    const txCollection = await getCollection("transactions");
    const cardsCollection = await getCollection("cards");

    // Find all confirmed mint transactions with empty tokenIds
    const mintTxs = await txCollection
      .find({ type: "mint", status: "confirmed", tokenIds: { $size: 0 } })
      .toArray();

    const results: string[] = [];

    for (const tx of mintTxs) {
      if (!tx.txHash) continue;

      const receipt = await provider.getTransactionReceipt(tx.txHash);
      if (!receipt || receipt.status !== 1) {
        results.push(`tx ${tx.txHash.slice(0, 10)}... failed on-chain`);
        continue;
      }

      const contractAddress = (tx.contractAddress || process.env.CONTRACT_ADDRESS || "").trim().toLowerCase();
      const tokenIds: number[] = [];
      let mintIndex = 0;

      for (const log of receipt.logs) {
        if (
          log.topics[0] === CARD_MINTED_TOPIC &&
          log.address.toLowerCase() === contractAddress
        ) {
          const tokenId = parseInt(log.topics[1], 16);
          const data = log.data.slice(2);
          const rarity = parseInt(data.slice(64, 128), 16);
          tokenIds.push(tokenId);

          // Update the card with tokenId and status
          const updateResult = await cardsCollection.updateOne(
            { txId: tx._id.toString(), pickIndex: mintIndex },
            {
              $set: {
                tokenId,
                status: "Digital",
                rarity,
                lastOnChainSync: new Date().toISOString(),
              },
            }
          );

          results.push(
            `tx ${tx.txHash.slice(0, 10)}... card pickIndex ${mintIndex}: tokenId=${tokenId} rarity=${rarity} matched=${updateResult.matchedCount}`
          );
          mintIndex++;
        }
      }

      // Update transaction with tokenIds
      if (tokenIds.length > 0) {
        await txCollection.updateOne(
          { _id: tx._id },
          { $set: { tokenIds } }
        );
        results.push(`tx ${tx.txHash.slice(0, 10)}... updated ${tokenIds.length} tokenIds`);
      } else {
        results.push(`tx ${tx.txHash.slice(0, 10)}... no CardMinted events found (contract: ${contractAddress})`);
      }
    }

    return NextResponse.json({
      success: true,
      processed: mintTxs.length,
      details: results,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
