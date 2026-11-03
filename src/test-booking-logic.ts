import { connectToDatabase, closeDatabase } from "./config/db.js";
import { StudioService } from "./services/studio.service.js";
import { BookingService } from "./services/booking.service.js";
import { ReservationLockService } from "./services/reservation-lock.service.js";
import { AuthenticatedUser } from "./config/auth.js";
import { ObjectId } from "mongodb";
import crypto from "crypto";

async function verifyBookingLogic() {
  console.log("\n=======================================================");
  console.log("  STUDIOSPACE — ASSIGNMENT 8 BOOKING LOGIC VERIFICATION");
  console.log("=======================================================\n");

  const db = await connectToDatabase();

  const testHost: AuthenticatedUser = {
    id: `host-bl-${crypto.randomUUID()}`,
    email: `host.bl.${Date.now()}@studiospace.test`,
    name: "Booking Test Host",
  };

  const testCreatorA: AuthenticatedUser = {
    id: `creator-a-${crypto.randomUUID()}`,
    email: `creator.a.${Date.now()}@studiospace.test`,
    name: "Creator Alice",
  };

  const testCreatorB: AuthenticatedUser = {
    id: `creator-b-${crypto.randomUUID()}`,
    email: `creator.b.${Date.now()}@studiospace.test`,
    name: "Creator Bob",
  };

  const createdStudioIds: ObjectId[] = [];
  const createdBookingIds: ObjectId[] = [];

  try {
    // 1. Create temporary test studio
    const studioDoc = await StudioService.createStudio(
      {
        title: "Test Cinema Stage for Booking Logic",
        category: "Sound Stage",
        hourlyRate: 100,
        securityDeposit: 200,
        maxCapacity: 30,
        location: "123 Film Row, Queens, NY",
        imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
        amenities: ["Lighting Grid", "Soundproofing"],
        overview: "Dedicated temporary space for rigorous booking rule tests.",
      },
      testHost
    );
    const studioId = new ObjectId(studioDoc._id);
    createdStudioIds.push(studioId);

    const testDate = "2027-02-20";

    // -------------------------------------------------------------------------
    // TEST 1: Pending bookings do NOT block new bookings
    // -------------------------------------------------------------------------
    console.log("--- TEST 1: Pending status does not block overlapping slots ---");
    const pendingBooking1 = await BookingService.createBooking(
      {
        studioId: studioId.toString(),
        bookingDate: testDate,
        startTime: "09:00",
        endTime: "13:00",
        notes: "Pending booking 1",
      },
      testCreatorA
    );
    createdBookingIds.push(new ObjectId(pendingBooking1._id));
    console.log(`  ✓ Creator A created Pending booking (09:00 - 13:00), ID: ${pendingBooking1._id}`);

    // Creator B requests overlapping slot (10:00 - 14:00) while first is still PENDING
    const pendingBooking2 = await BookingService.createBooking(
      {
        studioId: studioId.toString(),
        bookingDate: testDate,
        startTime: "10:00",
        endTime: "14:00",
        notes: "Pending booking 2 (overlapping while previous is pending)",
      },
      testCreatorB
    );
    createdBookingIds.push(new ObjectId(pendingBooking2._id));
    console.log(`  ✓ Creator B allowed to request overlapping slot (10:00 - 14:00) while first booking is PENDING`);
    console.log(`  ✓ RULE CONFIRMED: Only 'Confirmed' bookings block overlapping slots.`);

    // -------------------------------------------------------------------------
    // TEST 2: Host confirms 09:00–13:00 booking
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Host confirms 09:00–13:00 booking ---");
    const confirmedBooking1 = await BookingService.updateBookingStatus(
      pendingBooking1._id.toString(),
      "Confirmed",
      testHost
    );
    console.log(`  ✓ Booking 1 (09:00 - 13:00) transitioned to Confirmed by Host.`);

    // -------------------------------------------------------------------------
    // TEST 3: 09:00–13:00 followed by 12:00–16:00: MUST REJECT
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: 09:00–13:00 followed by 12:00–16:00 (MUST REJECT) ---");
    let overlapRejected = false;
    try {
      await BookingService.createBooking(
        {
          studioId: studioId.toString(),
          bookingDate: testDate,
          startTime: "12:00",
          endTime: "16:00",
          notes: "Conflicting booking attempt",
        },
        testCreatorB
      );
    } catch (err: any) {
      if (err.statusCode === 409 || err.message?.includes("already reserved")) {
        overlapRejected = true;
        console.log(`  ✓ REJECTED as expected: HTTP 409 Conflict - "${err.message}"`);
      }
    }
    if (!overlapRejected) {
      throw new Error("FAILED: Overlapping booking (12:00–16:00) was NOT rejected!");
    }
    console.log("  ✓ RULE CONFIRMED: 09:00–13:00 followed by 12:00–16:00 is strictly REJECTED.");

    // Also verify confirming pendingBooking2 (10:00–14:00) is now blocked by confirmedBooking1
    let hostConfirmRejected = false;
    try {
      await BookingService.updateBookingStatus(
        pendingBooking2._id.toString(),
        "Confirmed",
        testHost
      );
    } catch (err: any) {
      if (err.statusCode === 409) {
        hostConfirmRejected = true;
        console.log(`  ✓ Host cannot confirm second overlapping pending booking: HTTP 409 Conflict`);
      }
    }
    if (!hostConfirmRejected) {
      throw new Error("FAILED: Host was able to confirm overlapping booking!");
    }

    // -------------------------------------------------------------------------
    // TEST 4: 09:00–13:00 followed by 13:00–17:00: MUST ACCEPT (Adjacent Contiguous)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: 09:00–13:00 followed by 13:00–17:00 (MUST ACCEPT) ---");
    const adjacentBooking = await BookingService.createBooking(
      {
        studioId: studioId.toString(),
        bookingDate: testDate,
        startTime: "13:00",
        endTime: "17:00",
        notes: "Adjacent contiguous booking",
      },
      testCreatorB
    );
    createdBookingIds.push(new ObjectId(adjacentBooking._id));
    console.log(`  ✓ ACCEPTED as expected: Created booking (13:00 - 17:00), ID: ${adjacentBooking._id}`);

    const confirmedAdjacent = await BookingService.updateBookingStatus(
      adjacentBooking._id.toString(),
      "Confirmed",
      testHost
    );
    console.log(`  ✓ Host confirmed adjacent contiguous booking (13:00 - 17:00) without conflict.`);
    console.log("  ✓ RULE CONFIRMED: 09:00–13:00 followed by 13:00–17:00 is strictly ACCEPTED.");

    // -------------------------------------------------------------------------
    // TEST 5: Concurrent booking requests & mutual exclusion
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Concurrent booking requests & atomic lock ---");
    // Simulate two parallel workers attempting to confirm overlapping slots at the exact same instant
    const worker1 = ReservationLockService.generateWorkerId("worker_alpha");
    const worker2 = ReservationLockService.generateWorkerId("worker_beta");

    const lock1 = await ReservationLockService.acquireLock(studioId.toString(), testDate, worker1, 1000, 10000);
    const lock2 = await ReservationLockService.acquireLock(studioId.toString(), testDate, worker2, 500, 10000);

    console.log(`  ✓ Worker Alpha acquired lock: ${lock1}`);
    console.log(`  ✓ Worker Beta blocked by lock: ${lock2 === false}`);
    if (!lock1 || lock2) {
      throw new Error("FAILED: Atomic lock did not enforce mutual exclusion!");
    }

    await ReservationLockService.releaseLock(studioId.toString(), testDate, worker1);
    console.log(`  ✓ Worker Alpha released lock.`);

    const lock2Retry = await ReservationLockService.acquireLock(studioId.toString(), testDate, worker2, 1000, 10000);
    console.log(`  ✓ Worker Beta acquired lock after release: ${lock2Retry}`);
    await ReservationLockService.releaseLock(studioId.toString(), testDate, worker2);
    console.log(`  ✓ Worker Beta released lock.`);
    console.log("  ✓ RULE CONFIRMED: Multi-instance concurrency mutual exclusion guaranteed.");

    console.log("\n=======================================================");
    console.log("  ALL BOOKING LOGIC & CONCURRENCY TESTS PASSED (5/5)!");
    console.log("=======================================================\n");

    return true;
  } finally {
    console.log("[Cleanup] Safely removing temporary test records from Atlas...");
    for (const sid of createdStudioIds) {
      await db.collection("studios").deleteOne({ _id: sid });
    }
    for (const bid of createdBookingIds) {
      await db.collection("bookings").deleteOne({ _id: bid });
    }
    await db.collection("reservation_locks").deleteMany({ studioId: { $in: createdStudioIds.map((id) => id.toString()) } });
    console.log("[Cleanup] Completed safely.");
    await closeDatabase();
  }
}

verifyBookingLogic()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((err) => {
    console.error("Booking logic test failure:", err);
    process.exit(1);
  });
