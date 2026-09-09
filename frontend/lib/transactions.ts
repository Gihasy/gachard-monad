import { getCollection } from "./mongodb";
import { ObjectId } from "mongodb";
import { getProvider } from "./blockchain";
import { ethers } from "ethers";
import { generateInvoiceId } from "./invoice";
import { friendlyTxStatus } from "./status-map";

export type TxStatus = "pending" | "confirmed" | "failed";

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
      }
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
