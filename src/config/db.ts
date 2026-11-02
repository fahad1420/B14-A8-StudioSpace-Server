import { MongoClient, Db } from "mongodb";
import { ENV } from "./env.js";
import { MemoryDatabase } from "./memory-db.js";

let client: MongoClient | null = null;
let dbInstance: any = null;

export async function connectToDatabase(): Promise<any> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    client = new MongoClient(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500,
    });
    await client.connect();
    dbInstance = client.db(ENV.MONGODB_DB_NAME);
    console.log(`[Database] Connected successfully to live MongoDB: ${ENV.MONGODB_DB_NAME}`);

    await setupIndexes(dbInstance);
    return dbInstance;
  } catch (error: any) {
    console.warn(`[Database] Notice: Live MongoDB at ${ENV.MONGODB_URI} is not currently reachable.`);
    console.warn(`[Database] Activating fast In-Memory MongoDB Engine for standalone local execution.`);
    console.warn(`[Database] (When deploying to production, provide your MongoDB Atlas URI in .env)`);

    dbInstance = new MemoryDatabase();
    return dbInstance;
  }
}

export function getDatabase(): any {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call connectToDatabase() first.");
  }
  return dbInstance;
}

export function getClient(): MongoClient | null {
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

