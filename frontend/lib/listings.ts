import { getCollection } from "./mongodb";
import { ObjectId } from "mongodb";

export interface Listing {
  _id?: ObjectId;
  listingId: string;
  cardId: string;
  tokenId: number;
  templateId: string;
  sellerId: string;
  sellerWalletAddress: string;
  price: number;
  status: "active" | "sold" | "cancelled";
  createdAt: string;
  soldAt?: string;
  buyerId?: string;
}

export async function createListing(data: {
  cardId: string;
  tokenId: number;
  templateId: string;
  sellerId: string;
  sellerWalletAddress: string;
  price: number;
}): Promise<Listing> {
  const collection = await getCollection("listings");
  const listingId = `LS-${Date.now().toString(36).toUpperCase()}`;
  const doc: Listing = {
    listingId,
    cardId: data.cardId,
    tokenId: data.tokenId,
    templateId: data.templateId,
    sellerId: data.sellerId,
    sellerWalletAddress: data.sellerWalletAddress,
    price: data.price,
    status: "active",
    createdAt: new Date().toISOString(),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function getActiveListings(filter?: { templateId?: string }): Promise<Listing[]> {
  const collection = await getCollection("listings");
  const query: Record<string, unknown> = { status: "active" };
  if (filter?.templateId) query.templateId = filter.templateId;
  return collection.find(query).sort({ createdAt: -1 }).toArray() as Promise<Listing[]>;
}

export async function getListingById(listingId: string): Promise<Listing | null> {
  const collection = await getCollection("listings");
  return collection.findOne({ listingId }) as Promise<Listing | null>;
}

export async function cancelListing(listingId: string, sellerId: string): Promise<boolean> {
  const collection = await getCollection("listings");
  const result = await collection.updateOne(
    { listingId, sellerId, status: "active" },
    { $set: { status: "cancelled", updatedAt: new Date().toISOString() } }
  );
  return result.modifiedCount === 1;
}

export async function markListingSold(
  listingId: string,
  buyerId: string
): Promise<Listing | null> {
  const collection = await getCollection("listings");
  const result = await collection.findOneAndUpdate(
    { listingId, status: "active" },
    {
      $set: {
        status: "sold",
        buyerId,
        soldAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" }
  );
  return result as Listing | null;
}
