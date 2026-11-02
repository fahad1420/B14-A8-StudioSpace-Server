import { MongoClient, Db, Collection } from "mongodb";
import { ENV } from "./env.js";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function connectToDatabase(): Promise<Db> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    client = new MongoClient(ENV.MONGODB_URI);
    await client.connect();
    dbInstance = client.db(ENV.MONGODB_DB_NAME);
    console.log(`[Database] Connected successfully to MongoDB: ${ENV.MONGODB_DB_NAME}`);

    await setupIndexes(dbInstance);

    return dbInstance;
  } catch (error) {
    console.error("[Database] Failed to connect to MongoDB:", error);
    throw error;
  }
}

export function getDatabase(): Db {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call connectToDatabase() first.");
  }
  return dbInstance;
}

export function getClient(): MongoClient {
  if (!client) {
    throw new Error("MongoClient not initialized. Call connectToDatabase() first.");
  }
  return client;
}

async function setupIndexes(db: Db) {
  try {
    const studios = db.collection("studios");
    await studios.createIndex({ hostId: 1 });
    await studios.createIndex({ category: 1 });
    await studios.createIndex({ hourlyRate: 1 });
    await studios.createIndex({ title: "text", location: "text" });

    const bookings = db.collection("bookings");
    await bookings.createIndex({ creatorId: 1 });
    await bookings.createIndex({ hostId: 1 });
    await bookings.createIndex({ studioId: 1, bookingDate: 1, status: 1 });

    const newsletters = db.collection("newsletters");
    await newsletters.createIndex({ email: 1 }, { unique: true });

    const wishlists = db.collection("wishlists");
    await wishlists.createIndex({ userId: 1, studioId: 1 }, { unique: true });

    console.log("[Database] Indexes created successfully.");
  } catch (error) {
    console.warn("[Database] Index setup notice:", error);
  }
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
    console.log("[Database] MongoDB connection closed.");
  }
}
