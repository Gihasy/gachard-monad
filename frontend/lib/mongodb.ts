import { MongoClient, Db, ObjectId } from "mongodb";

const MONGODB_URL = process.env.MONGODB_URL || "";
const DATABASE_NAME = process.env.DATABASE_NAME || "gachard";

let client: MongoClient;
let db: Db;
let indexesCreated = false;

export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  if (!MONGODB_URL) {
    throw new Error("MONGODB_URL environment variable is not set");
  }

  client = new MongoClient(MONGODB_URL, {
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 30000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 30000,
  });
  await client.connect();
  db = client.db(DATABASE_NAME);

  // Create indexes once per cold start
  if (!indexesCreated) {
    indexesCreated = true;
    await createIndexes(db).catch((err) =>
      console.warn("[mongodb] index creation failed:", err.message)
    );
  }

  return db;
}

async function createIndexes(database: Db) {
  await Promise.all([
    // Cards — most queried collection
    database.collection("cards").createIndex({ ownerAddress: 1 }),
    database.collection("cards").createIndex({ cardId: 1 }, { unique: true }),
    database.collection("cards").createIndex({ tokenId: 1 }, { sparse: true }),
    database.collection("cards").createIndex({ templateId: 1 }),
    database.collection("cards").createIndex({ status: 1 }),
    database.collection("cards").createIndex({ isListed: 1 }),
    database.collection("cards").createIndex({ listingId: 1 }),

    // Listings — marketplace queries
    database.collection("listings").createIndex({ listingId: 1 }, { unique: true }),
    database.collection("listings").createIndex({ status: 1, createdAt: -1 }),
    database.collection("listings").createIndex({ templateId: 1, status: 1 }),
    database.collection("listings").createIndex({ sellerId: 1 }),

    // Transactions — history and polling
    database.collection("transactions").createIndex({ userId: 1, createdAt: -1 }),
    database.collection("transactions").createIndex({ txHash: 1 }),
    database.collection("transactions").createIndex({ status: 1 }),
    database.collection("transactions").createIndex({ tokenId: 1 }),

    // Supporters
    database.collection("supporters").createIndex({ email: 1 }, { unique: true }),

    // Crystal balances
    database.collection("crystal_balances").createIndex({ userId: 1 }, { unique: true }),

    // Users
    database.collection("users").createIndex({ walletAddress: 1 }),
    database.collection("users").createIndex({ username: 1 }),

    // Card templates
    database.collection("card_templates").createIndex({ templateId: 1 }, { unique: true }),
    database.collection("card_templates").createIndex({ rarity: 1 }),

    // Redeem codes
    database.collection("redeem_codes").createIndex({ tokenId: 1 }),
    database.collection("redeem_codes").createIndex({ txId: 1 }),
  ]);
}

export async function getCollection(name: string) {
  const database = await connectToDatabase();
  return database.collection(name);
}

export function parseObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid ID format");
  }
  return new ObjectId(id);
}
