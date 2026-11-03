import { connectToDatabase, closeDatabase } from "./config/db.js";
import { StudioService } from "./services/studio.service.js";
import { BookingService } from "./services/booking.service.js";
import { ReservationLockService } from "./services/reservation-lock.service.js";
import { AuthenticatedUser } from "./config/auth.js";
import { ObjectId } from "mongodb";
import crypto from "crypto";

async function runRealCrudAndBookingTest() {
  console.log("\n=======================================================");
  console.log("  STUDIOSPACE — REAL MONGODB ATLAS CRUD & BOOKING TEST");
  console.log("=======================================================\n");

  const db = await connectToDatabase();

  const testHost: AuthenticatedUser = {
    id: `host-test-${crypto.randomUUID()}`,
    email: `host.${Date.now()}@studiospace.test`,
    name: "Atlas Test Host",
  };

  const testCreator: AuthenticatedUser = {
    id: `creator-test-${crypto.randomUUID()}`,
    email: `creator.${Date.now()}@studiospace.test`,
    name: "Atlas Test Creator",
  };

  const createdStudioIds: ObjectId[] = [];
  const createdBookingIds: ObjectId[] = [];

  try {
    // -------------------------------------------------------------------------
    // PHASE 6: REAL STUDIO CRUD TESTING ON MONGODB ATLAS
    // -------------------------------------------------------------------------
    console.log("--- PHASE 6: REAL STUDIO CRUD ON MONGODB ATLAS ---");

    // 1. Create a test studio
    console.log("\n[1/6] Creating real Studio listing in MongoDB Atlas...");
    const studioInput = {
      title: "Manhattan Highline Daylight Loft",
      category: "Photo Studio" as const,
      hourlyRate: 110,
      securityDeposit: 150,
      maxCapacity: 25,
      location: "520 W 28th St, Chelsea, New York, NY",
      imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
      amenities: ["Floor-to-Ceiling Windows", "Highline Views", "Fiber Internet"],
      overview: "Direct verification test listing for real MongoDB Atlas persistence.",
    };

    const createdStudio = await StudioService.createStudio(studioInput, testHost);
    const studioId = new ObjectId(createdStudio._id);
    createdStudioIds.push(studioId);
    console.log(`  ✓ Created studio with ID: ${studioId.toString()}`);

    // 2. Verify MongoDB document directly in Atlas
    console.log("\n[2/6] Verifying document directly in Atlas 'studios' collection...");
    const directDoc = await db.collection("studios").findOne({ _id: studioId });
    if (!directDoc) throw new Error("Studio document not found in MongoDB Atlas collection.");
    if (directDoc.title !== studioInput.title) throw new Error("Studio title mismatch in Atlas document.");
    if (directDoc.hostId !== testHost.id) throw new Error("Studio hostId mismatch in Atlas document.");
    console.log(`  ✓ Direct Atlas document verified. Title: "${directDoc.title}", Host: ${directDoc.hostName}`);

    // 3. Read it through the API Service
    console.log("\n[3/6] Reading studio through StudioService.getStudioById...");
    const readViaService = await StudioService.getStudioById(studioId.toString());
    if (!readViaService) throw new Error("StudioService failed to read document from Atlas.");
    if (readViaService.hourlyRate !== 110) throw new Error("Hourly rate mismatch in read result.");
    console.log(`  ✓ Studio read through service verified. Hourly rate: $${readViaService.hourlyRate}`);

    // 4. Update it
    console.log("\n[4/6] Updating studio listing in Atlas...");
    const updateInput = {
      title: "Manhattan Highline Daylight Loft [Updated]",
      hourlyRate: 135,
      securityDeposit: 200,
    };
    const updatedStudio = await StudioService.updateStudio(studioId.toString(), updateInput, testHost);
    console.log(`  ✓ Update applied via StudioService. New hourly rate: $${updatedStudio.hourlyRate}`);

    // 5. Verify the update directly in Atlas
    console.log("\n[5/6] Verifying updated fields directly in MongoDB Atlas...");
    const directUpdated = await db.collection("studios").findOne({ _id: studioId });
    if (!directUpdated || directUpdated.title !== "Manhattan Highline Daylight Loft [Updated]") {
      throw new Error("Updated title did not persist in MongoDB Atlas.");
    }
    if (directUpdated.hourlyRate !== 135) {
      throw new Error("Updated hourly rate did not persist in MongoDB Atlas.");
    }
    console.log(`  ✓ Atlas document confirmed updated: "${directUpdated.title}", Rate: $${directUpdated.hourlyRate}`);

    // 6. Delete only the test record
    console.log("\n[6/6] Deleting test studio record from Atlas...");
    await StudioService.deleteStudio(studioId.toString(), testHost);
    const directAfterDelete = await db.collection("studios").findOne({ _id: studioId });
    if (directAfterDelete) {
      throw new Error("Studio record was not deleted from MongoDB Atlas.");
    }
    console.log(`  ✓ Test studio record successfully purged from Atlas. Verified absent: ${directAfterDelete === null}`);


    // -------------------------------------------------------------------------
    // PHASE 7: REAL BOOKING & CONCURRENCY TESTING ON MONGODB ATLAS
    // -------------------------------------------------------------------------
    console.log("\n--- PHASE 7: REAL BOOKING & CONCURRENCY ON MONGODB ATLAS ---");

    // Recreate a studio for booking tests
    const bookingStudioDoc = await StudioService.createStudio(
      {
        title: "Brooklyn Soundstage Lab",
        category: "Sound Stage",
        hourlyRate: 120,
        securityDeposit: 250,
        maxCapacity: 50,
        location: "150 Greenpoint Ave, Brooklyn, NY",
        imageUrl: "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80",
        amenities: ["Soundproofing", "Power Grid"],
        overview: "Dedicated studio for real booking flow and lock verification.",
      },
      testHost
    );
    const bookingStudioId = new ObjectId(bookingStudioDoc._id);
    createdStudioIds.push(bookingStudioId);

    const testDate = "2026-12-10";

    // 1. Create a booking (09:00 - 13:00 = 4 hours)
    console.log("\n[1/7] Creating booking via BookingService (09:00 - 13:00)...");
    const bookingA = await BookingService.createBooking(
      {
        studioId: bookingStudioId.toString(),
        bookingDate: testDate,
        startTime: "09:00",
        endTime: "13:00",
        notes: "Real booking test",
      },
      testCreator
    );
    const bookingAId = new ObjectId(bookingA._id);
    createdBookingIds.push(bookingAId);

    // 2. Verify Pending status and server-side price calculation
    console.log("\n[2/7] Verifying Pending status and server-side calculation...");
    if (bookingA.status !== "Pending") throw new Error(`Initial status was ${bookingA.status}, expected Pending.`);
    if (bookingA.duration !== 4) throw new Error(`Calculated duration was ${bookingA.duration}, expected 4.`);
    if (bookingA.rentalAmount !== 480) throw new Error(`Rental amount was ${bookingA.rentalAmount}, expected 480.`);
    if (bookingA.securityDeposit !== 250) throw new Error(`Security deposit was ${bookingA.securityDeposit}, expected 250.`);
    if (bookingA.totalAmount !== 730) throw new Error(`Total payable was ${bookingA.totalAmount}, expected 730.`);
    console.log(`  ✓ Status is strictly 'Pending'. Price calculated server-side: 4h * $120 + $250 = $${bookingA.totalAmount}`);

    // 3. Verify Atlas persistence
    console.log("\n[3/7] Verifying booking persistence in MongoDB Atlas...");
    const directBooking = await db.collection("bookings").findOne({ _id: bookingAId });
    if (!directBooking) throw new Error("Booking document missing from MongoDB Atlas.");
    console.log(`  ✓ Booking document verified in Atlas. Creator: ${directBooking.creatorName}`);

    // 4. Host confirms booking
    console.log("\n[4/7] Testing Host confirmation...");
    const confirmedBooking = await BookingService.updateBookingStatus(
      bookingAId.toString(),
      "Confirmed",
      testHost
    );
    if (confirmedBooking.status !== "Confirmed") throw new Error("Status failed to transition to Confirmed.");
    console.log(`  ✓ Booking transitioned to Confirmed by authorized Host.`);

    // 5. Overlap Prevention: Conflicting booking (11:00 - 15:00) must be rejected
    console.log("\n[5/7] Testing Double-Booking Overlap Prevention (11:00 - 15:00)...");
    let overlapRejected = false;
    try {
      await BookingService.createBooking(
        {
          studioId: bookingStudioId.toString(),
          bookingDate: testDate,
          startTime: "11:00",
          endTime: "15:00",
          notes: "Conflicting booking attempt",
        },
        testCreator
      );
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes("already booked")) {
        overlapRejected = true;
      }
    }
    if (!overlapRejected) throw new Error("Double booking was not rejected with 409 Conflict!");
    console.log("  ✓ Conflicting overlapping booking successfully rejected with 409 Conflict.");

    // 6. Adjacent Booking Acceptance: (13:00 - 17:00) must succeed
    console.log("\n[6/7] Testing Adjacent Contiguous Booking Acceptance (13:00 - 17:00)...");
    const adjacentBooking = await BookingService.createBooking(
      {
        studioId: bookingStudioId.toString(),
        bookingDate: testDate,
        startTime: "13:00",
        endTime: "17:00",
        notes: "Adjacent booking",
      },
      testCreator
    );
    const adjacentBookingId = new ObjectId(adjacentBooking._id);
    createdBookingIds.push(adjacentBookingId);
    console.log(`  ✓ Contiguous adjacent booking (13:00 - 17:00) created successfully (ID: ${adjacentBookingId.toString()}).`);

    // 7. Reservation Lock Release & Cancellation
    console.log("\n[7/7] Testing Distributed Reservation Lock & Creator Cancellation...");
    const workerId = ReservationLockService.generateWorkerId("test-worker");
    const lockAcquired = await ReservationLockService.acquireLock(bookingStudioId.toString(), testDate, workerId, 6000, 15000);
    if (!lockAcquired) throw new Error("Failed to acquire distributed reservation lock on Atlas.");
    console.log("  ✓ Distributed lock atomically acquired on MongoDB Atlas.");

    await ReservationLockService.releaseLock(bookingStudioId.toString(), testDate, workerId);
    console.log("  ✓ Distributed lock safely released on MongoDB Atlas.");

    const cancelledBooking = await BookingService.cancelBooking(adjacentBookingId.toString(), testCreator);
    if (cancelledBooking.status !== "Cancelled") throw new Error("Cancellation failed.");
    console.log(`  ✓ Creator successfully cancelled booking. Final status: ${cancelledBooking.status}`);

    console.log("\n=======================================================");
    console.log("  ALL REAL ATLAS CRUD & BOOKING VERIFICATIONS PASSED!");
    console.log("=======================================================\n");

    return true;
  } finally {
    // Clean up test documents safely
    console.log("[Cleanup] Removing temporary test documents from MongoDB Atlas...");
    for (const sid of createdStudioIds) {
      await db.collection("studios").deleteOne({ _id: sid });
    }
    for (const bid of createdBookingIds) {
      await db.collection("bookings").deleteOne({ _id: bid });
    }
    await db.collection("reservation_locks").deleteMany({ studioId: { $in: createdStudioIds.map((id) => id.toString()) } });
    console.log("[Cleanup] Completed safely. Only test records removed.");
    await closeDatabase();
  }
}

runRealCrudAndBookingTest()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((err) => {
    console.error("\n[Fatal Failure during test]:", err);
    process.exit(1);
  });
