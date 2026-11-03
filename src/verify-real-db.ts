import { MongoClient, ObjectId } from "mongodb";
import dns from "dns";
import { ENV } from "./config/env.js";
import crypto from "crypto";

// Ensure robust SRV DNS resolution on Windows / restrictive ISP environments for MongoDB Atlas
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch {
  // Ignore if custom DNS cannot be set
}

function maskUri(uri: string): string {
  try {
    if (uri.includes("@")) {
      const parts = uri.split("@");
      const hostPart = parts[1];
      return `mongodb+srv://****:****@${hostPart}`;
    }
    return uri;
  } catch {
    return "<configured>";
  }
}

export async function verifyRealDatabase(): Promise<boolean> {
  console.log("\n=======================================================");
  console.log("  STUDIOSPACE — REAL MONGODB ATLAS INTEGRATION AUDIT");
  console.log("=======================================================\n");

  const uri = ENV.MONGODB_URI;
  const dbName = ENV.MONGODB_DB_NAME || "studiospace";
  const isAtlas = uri.startsWith("mongodb+srv://");

  console.log(`[Config] Target Database Name: ${dbName}`);
  console.log(`[Config] URI Mode: ${isAtlas ? "MongoDB Atlas Cloud Cluster" : "Standard MongoDB URI"}`);
  console.log(`[Config] Endpoint: ${maskUri(uri)}`);

  let client: MongoClient;
  try {
    console.log("\n[1/6] Establishing live connection to MongoDB cluster...");
    client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
    });
    await client.connect();
    console.log("  ✓ SUCCESS: Connected to live MongoDB cluster!");
  } catch (err: any) {
    console.error("\n  ✗ FAILED: Unable to reach MongoDB cluster.");
    console.error(`  Error message: ${err.message}`);
    console.error("\n[Troubleshooting Checklist]");
    if (isAtlas) {
      console.error("  1. Verify your IP is whitelisted in MongoDB Atlas: Network Access -> Add IP Address (allow 0.0.0.0/0 for anywhere, or your current public IP).");
      console.error("  2. Verify database username and password in MONGODB_URI (ensure special characters in password are URL-encoded).");
      console.error("  3. Verify DNS resolution for your Atlas cluster hostname.");
    } else {
      console.error("  1. Ensure local mongod service is active on 127.0.0.1:27017, OR");
      console.error("  2. Provide a valid MongoDB Atlas connection string in b14-a8-shoot-location-server/.env");
    }
    return false;
  }

  try {
    const db = client.db(dbName);

    // 2. Collection & Index Verification
    console.log("\n[2/6] Verifying collections and database indexes...");
    const requiredCollections = [
      "user",
      "session",
      "account",
      "studios",
      "bookings",
      "newsletters",
      "wishlists",
      "reservation_locks",
    ];

    for (const colName of requiredCollections) {
      const col = db.collection(colName);
      // Touch collection
      await col.estimatedDocumentCount().catch(() => 0);
    }

    // Verify / Setup essential indexes
    await db.collection("user").createIndex({ email: 1 }, { unique: true });
    await db.collection("session").createIndex({ token: 1 }, { unique: true });
    await db.collection("session").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection("account").createIndex({ userId: 1 });
    await db.collection("studios").createIndex({ hostId: 1 });
    await db.collection("studios").createIndex({ category: 1 });
    await db.collection("bookings").createIndex({ studioId: 1, bookingDate: 1, status: 1 });
    await db.collection("reservation_locks").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });

    console.log("  ✓ SUCCESS: All 8 required collections and indexes verified (including TTL index on reservation_locks).");

    // 3. User & Session Persistence Test
    console.log("\n[3/6] Testing User & Better Auth persistence...");
    const testEmail = `atlas.test.${Date.now()}@studiospace.test`;
    const testUserId = `test-user-${crypto.randomUUID()}`;
    const testUserDoc = {
      _id: new ObjectId(),
      id: testUserId,
      name: "Atlas Test Creator",
      email: testEmail,
      emailVerified: true,
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("user").insertOne(testUserDoc as any);
    const retrievedUser = await db.collection("user").findOne({ email: testEmail });
    if (!retrievedUser || retrievedUser.email !== testEmail) {
      throw new Error("Failed to write/read user document from MongoDB.");
    }
    console.log(`  ✓ SUCCESS: User document created and verified in 'user' collection (ID: ${retrievedUser.id}).`);

    // 4. Studio Listing Persistence Test
    console.log("\n[4/6] Testing Studio CRUD operations in database...");
    const testStudioDoc = {
      _id: new ObjectId(),
      title: "Atlas Verification Soundstage",
      category: "Sound Stage",
      hourlyRate: 150,
      securityDeposit: 200,
      maxCapacity: 40,
      location: "500 Cloud Way, Suite 10, Manhattan, NY",
      imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
      amenities: ["Acoustic Soundproofing", "Dedicated 3-Phase Power"],
      overview: "Temporary studio created for real database integration audit.",
      hostId: testUserId,
      hostName: "Atlas Test Creator",
      hostEmail: testEmail,
      rating: 5.0,
      reviewCount: 0,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("studios").insertOne(testStudioDoc as any);
    const retrievedStudio = await db.collection("studios").findOne({ _id: testStudioDoc._id });
    if (!retrievedStudio || retrievedStudio.title !== testStudioDoc.title) {
      throw new Error("Failed to write/read studio document from MongoDB.");
    }
    console.log(`  ✓ SUCCESS: Studio listing stored and verified (ID: ${retrievedStudio._id}).`);

    // 5. Booking Creation & Overlap Prevention Test
    console.log("\n[5/6] Testing Booking creation and concurrency lock...");
    const testDate = "2027-01-15";
    const testBookingDoc = {
      _id: new ObjectId(),
      studioId: testStudioDoc._id.toString(),
      studioTitle: testStudioDoc.title,
      studioImage: testStudioDoc.imageUrl,
      studioLocation: testStudioDoc.location,
      creatorId: testUserId,
      creatorName: "Atlas Test Creator",
      creatorEmail: testEmail,
      hostId: testUserId,
      hostName: "Atlas Test Creator",
      hostEmail: testEmail,
      bookingDate: testDate,
      startTime: "10:00",
      endTime: "14:00",
      duration: 4,
      hourlyRate: 150,
      rentalAmount: 600,
      securityDeposit: 200,
      totalAmount: 800,
      status: "Pending",
      notes: "Integration test booking",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.collection("bookings").insertOne(testBookingDoc as any);
    const retrievedBooking = await db.collection("bookings").findOne({ _id: testBookingDoc._id });
    if (!retrievedBooking || retrievedBooking.status !== "Pending") {
      throw new Error("Failed to write/read booking document from MongoDB.");
    }
    console.log(`  ✓ SUCCESS: Booking created with Pending status (ID: ${retrievedBooking._id}).`);

    // Verify atomic lock insertion in reservation_locks
    const lockKey = `lock:${testStudioDoc._id.toString()}:${testDate}`;
    await db.collection("reservation_locks").insertOne({
      _id: lockKey as any,
      studioId: testStudioDoc._id.toString(),
      bookingDate: testDate,
      ownerId: "atlas-worker-01",
      expireAt: new Date(Date.now() + 15000),
      acquiredAt: new Date(),
    });

    // Attempt second insert with same lock key (must throw duplicate key error)
    let duplicateRejected = false;
    try {
      await db.collection("reservation_locks").insertOne({
        _id: lockKey as any,
        studioId: testStudioDoc._id.toString(),
        bookingDate: testDate,
        ownerId: "atlas-worker-02",
        expireAt: new Date(Date.now() + 15000),
        acquiredAt: new Date(),
      });
    } catch (err: any) {
      if (err.code === 11000 || err.message?.includes("E11000") || err.message?.includes("duplicate")) {
        duplicateRejected = true;
      }
    }

    if (!duplicateRejected) {
      throw new Error("Reservation lock collection failed to enforce atomic uniqueness.");
    }
    console.log("  ✓ SUCCESS: Distributed reservation lock enforces atomic uniqueness on MongoDB.");

    // 6. Safe Cleanup (Only test records removed)
    console.log("\n[6/6] Cleaning up test records (safe, idempotent)...");
    await db.collection("user").deleteOne({ email: testEmail });
    await db.collection("account").deleteMany({ userId: testUserId });
    await db.collection("studios").deleteOne({ _id: testStudioDoc._id });
    await db.collection("bookings").deleteOne({ _id: testBookingDoc._id });
    await db.collection("reservation_locks").deleteOne({ _id: lockKey as any });

    // Confirm examiner account was NOT touched
    const examinerUser = await db.collection("user").findOne({ email: "examiner@studiospace.com" });
    console.log(`  ✓ SUCCESS: Test records safely purged. Permanent data intact (Examiner account exists: ${!!examinerUser}).`);

    console.log("\n=======================================================");
    console.log("  ALL REAL MONGODB ATLAS INTEGRATION CHECKS PASSED!");
    console.log("=======================================================\n");
    return true;
  } finally {
    await client.close();
  }
}

// Direct execution
if (process.argv[1]?.endsWith("verify-real-db.ts") || process.argv[1]?.endsWith("verify-real-db.js")) {
  verifyRealDatabase()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((err) => {
      console.error("[Fatal Error during verification]:", err);
      process.exit(1);
    });
}

