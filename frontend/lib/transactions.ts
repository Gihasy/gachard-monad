import { getCollection } from "./mongodb";
import { addCrystal } from "./crystal";
import { ObjectId, type Collection, type Db, type Document } from "mongodb";
import { getProvider } from "./blockchain";
import { ethers } from "ethers";
import { generateInvoiceId } from "./invoice";
import { friendlyTxStatus } from "./status-map";

export type TxStatus = "entropy_pending" | "pending" | "confirmed" | "failed";

export interface Transaction {
  _id?: ObjectId;
  userId: string;
  type: "mint" | "print" | "redeem" | "transfer" | "topup" | "dismantled" | "sold" | "listed" | "claimed";
  tokenId?: number;
  tokenIds?: number[];
  rarity?: number;
  rarities?: number[];
  templateIds?: string[];
  txHash: string | null;
  status: TxStatus;
  fromAddress: string;
  toAddress: string;
  amount?: number;
  purchasePrice?: number;
  contractAddress?: string;
  error?: string;
  entropySequenceNumber?: number;
  /** Block the entropy request landed in — anchors PackFulfilled event lookup. */
  entropyRequestBlock?: number | null;
  entropySeed?: string | null;
  rarityHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Event signatures
const CARD_MINTED_TOPIC = ethers.id("CardMinted(uint256,address,uint8,uint8)");
const CARD_STATUS_CHANGED_TOPIC = ethers.id("CardStatusChanged(uint256,uint8,uint8)");

/**
 * Create a new pending transaction record.
 */
export async function createTransaction(
  tx: Omit<Transaction, "_id" | "status" | "txHash" | "createdAt" | "updatedAt">
): Promise<Transaction> {
  const collection = await getCollection("transactions");
  const now = new Date().toISOString();

  const doc: Transaction = {
    ...tx,
    txHash: null,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * Update transaction status and txHash.
 */
export async function updateTransactionStatus(
  txId: ObjectId,
  status: TxStatus,
  txHash?: string,
  error?: string
): Promise<void> {
  const collection = await getCollection("transactions");
  await collection.updateOne(
    { _id: txId },
    {
      $set: {
        status,
        txHash: txHash || null,
        error: error || null,
        updatedAt: new Date().toISOString(),
      },
    }
  );
}

/**
 * Get transaction status for frontend polling.
 * Returns invoiceId (human-friendly) instead of raw ObjectId, and friendly status labels.
 * txHash is NOT exposed — kept internal for on-chain receipt checking only.
 */
export async function getTransactionStatus(txId: string) {
  const collection = await getCollection("transactions");
  const tx = await collection.findOne({ _id: new ObjectId(txId) });
  if (!tx) return null;

  return {
    id: generateInvoiceId(tx._id.toString()),
    rawId: tx._id.toString(),
    status: friendlyTxStatus(tx.status),
    rawStatus: tx.status,
    type: tx.type,
    tokenId: tx.tokenId,
    rarity: tx.rarity,
    error: tx.error,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

/**
 * Check on-chain receipt and update transaction status.
 * Handles mint (batch), print, and redeem events.
 */
/**
 * Finish a marketplace purchase whose receipt arrived too late.
 *
 * `api/marketplace/listings/[id]/buy` waits about three seconds for the
 * receipt. If it does not arrive it stores `pendingBuyerId`,
 * `pendingBuyerWallet`, `pendingSellerId`, `pendingListingPrice` and
 * `pendingTxHash` on the card — and nothing in the codebase ever read any of
 * them. The transfer had been submitted by the admin wallet and almost always
 * landed, so the chain was right and the database was permanently wrong: the
 * buyer's Crystal was spent, the card still belonged to the seller, and the
 * seller was never paid.
 *
 * Worse, `confirmTransaction` had no `sold` branch, so the sweep in
 * /api/cards would read the receipt and mark the row **confirmed** while none
 * of that was repaired. A ledger that says a sale completed when the card and
 * the money both disagree is worse than one that admits it is pending.
 *
 * **Exactly once, and that is the whole difficulty.** This runs from
 * /api/cards on every page load. Paying the seller twice would create Crystal
 * out of nothing. The card's pending fields are the latch: one conditional
 * update both claims them and clears them, and only the caller that won that
 * update pays out. A second call matches nothing and does nothing.
 */
// Exported for scripts/suite-api.ts. Reaching these through
// confirmTransaction would need a real confirmed receipt, and the property
// worth testing is not the dispatch — it is that a second call pays nobody a
// second time. That is worth a slightly wider surface.
export async function settleMarketplacePurchase(
  cardsCollection: Collection<Document>,
  tx: Document
) {
  const tokenId = typeof tx.tokenId === "number" ? tx.tokenId : null;
  if (tokenId === null) return;

  const claimed = await cardsCollection.findOneAndUpdate(
    { tokenId, pendingSellerId: { $exists: true } },
    {
      $set: {
        ownerAddress: tx.toAddress,
        status: "Digital",
        isListed: false,
        lastOnChainSync: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      $unset: {
        pendingBuyerId: "",
        pendingBuyerWallet: "",
        pendingSellerId: "",
        pendingListingPrice: "",
        pendingTxHash: "",
        listingId: "",
      },
    },
    { returnDocument: "before" }
  );

  if (!claimed) return;

  const sellerId = claimed.pendingSellerId;
  const price = claimed.pendingListingPrice;
  if (typeof sellerId === "string" && typeof price === "number" && price > 0) {
    // The whole price. There is no fee on a Crystal trade (ADR-024, amended),
    // and this path must agree with the confirmed path or the amount a seller
    // receives would depend on how fast the network was.
    await addCrystal(sellerId, price);
  }
}

/**
 * Undo a marketplace purchase whose transfer reverted on chain.
 *
 * The buy route refunds only when submitting throws. A transaction that is
 * accepted and then fails took the buyer's Crystal with it and left the card
 * in "pending" for good. Same latch, same exactly-once reasoning.
 */
/** Exported for the suite, for the same reason as above. */
export async function unwindMarketplacePurchase(
  db: Db,
  cardsCollection: Collection<Document>,
  tx: Document
) {
  const tokenId = typeof tx.tokenId === "number" ? tx.tokenId : null;
  if (tokenId === null) return;

  const claimed = await cardsCollection.findOneAndUpdate(
    { tokenId, pendingSellerId: { $exists: true } },
    {
      $set: { status: "Digital", isListed: false, updatedAt: new Date().toISOString() },
      $unset: {
        pendingBuyerId: "",
        pendingBuyerWallet: "",
        pendingSellerId: "",
        pendingListingPrice: "",
        pendingTxHash: "",
      },
    },
    { returnDocument: "before" }
  );

  if (!claimed) return;

  const buyerId = claimed.pendingBuyerId;
  const price = claimed.pendingListingPrice;
  if (typeof buyerId === "string" && typeof price === "number" && price > 0) {
    await addCrystal(buyerId, price);
  }

  // Put the listing back so the card is sellable again. The seller never lost
  // ownership — ownerAddress was left alone on this path — so reactivating is
  // the honest end state rather than inventing a cancellation.
  const listings = db.collection("listings");
  await listings.updateOne(
    { cardId: claimed.cardId, status: "sold" },
    { $set: { status: "active" }, $unset: { buyerId: "", soldAt: "" } }
  );
}

export async function confirmTransaction(txId: string): Promise<TxStatus> {
  const collection = await getCollection("transactions");
  const tx = await collection.findOne({ _id: new ObjectId(txId) });

  if (!tx || !tx.txHash) return "failed";
  if (tx.status !== "pending") return tx.status;

  try {
    const provider = getProvider();
    const receipt = await provider.getTransactionReceipt(tx.txHash);

    if (!receipt) {
      return "pending";
    }

    const newStatus: TxStatus = receipt.status === 1 ? "confirmed" : "failed";
    const contractAddress = process.env.CONTRACT_ADDRESS?.trim().toLowerCase();

    if (newStatus === "confirmed" && receipt.logs) {
      const cardsCollection = await collection.db.collection("cards");

      if (tx.type === "mint") {
        // Batch mint: loop SEMUA CardMinted events (jangan break setelah 1)
        const tokenIds: number[] = [];
        let mintIndex = 0;
        for (const log of receipt.logs) {
          if (
            log.topics[0] === CARD_MINTED_TOPIC &&
            log.address.toLowerCase() === contractAddress
          ) {
            const tokenId = parseInt(log.topics[1], 16);
            // rarity ada di data: topics[1]=tokenId, data[0:32]=status, data[32:64]=rarity
            const logData = log.data.slice(2);
            const rarity = parseInt(logData.slice(64, 128), 16);
            tokenIds.push(tokenId);

            // Match by txId DAN pickIndex + cache on-chain data
            await cardsCollection.updateOne(
              { txId: tx._id.toString(), pickIndex: mintIndex },
              {
                $set: {
                  tokenId,
                  status: "Digital",
                  rarity,
                  lastOwner: tx.toAddress,
                  lastOnChainSync: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              }
            );
            mintIndex++;
          }
        }

        // Update transaksi dengan array tokenIds
        if (tokenIds.length > 0) {
          await collection.updateOne(
            { _id: tx._id },
            { $set: { tokenIds } }
          );
        }
      } else if (tx.type === "print") {
        // Print: decode CardStatusChanged, update status ke Vaulted
        // oldStatus/newStatus bukan indexed — ada di log.data
        for (const log of receipt.logs) {
          if (
            log.topics[0] === CARD_STATUS_CHANGED_TOPIC &&
            log.address.toLowerCase() === contractAddress
          ) {
            const tokenId = parseInt(log.topics[1], 16);
            // data: 32 bytes oldStatus + 32 bytes newStatus
            const data = log.data.slice(2); // remove "0x"
            const newCardStatus = parseInt(data.slice(64, 128), 16); // second 32-byte word

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
            }
          }
        }
      } else if (tx.type === "redeem") {
        // Redeem: decode CardStatusChanged, update status ke Digital
        for (const log of receipt.logs) {
          if (
            log.topics[0] === CARD_STATUS_CHANGED_TOPIC &&
            log.address.toLowerCase() === contractAddress
          ) {
            const tokenId = parseInt(log.topics[1], 16);
            const data = log.data.slice(2);
            const newCardStatus = parseInt(data.slice(64, 128), 16); // second 32-byte word

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
            }
          }
        }
      } else if (tx.type === "sold") {
        await settleMarketplacePurchase(cardsCollection, tx);
      }
    }

    // A marketplace purchase whose transfer reverted. Without this the buyer's
    // Crystal is gone and the card belongs to nobody in particular: the buy
    // route only refunds when the submission itself throws, not when the
    // transaction lands and fails.
    if (newStatus === "failed" && tx.type === "sold") {
      const cardsCollection = await collection.db.collection("cards");
      await unwindMarketplacePurchase(collection.db, cardsCollection, tx);
    }

    await collection.updateOne(
      { _id: tx._id },
      {
        $set: {
          status: newStatus,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    return newStatus;
  } catch (error) {
    console.error("Confirm transaction error:", error);
    return "pending";
  }
}
