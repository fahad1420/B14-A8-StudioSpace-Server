import { connectToDatabase, closeDatabase } from "./config/db.js";
import { initAuth, signUserJWT } from "./config/auth.js";
import { seedDatabase } from "./seed.js";
import { StudioService } from "./services/studio.service.js";
import { BookingService } from "./services/booking.service.js";
import { AuthController } from "./controllers/auth.controller.js";
import { AuthenticatedUser } from "./config/auth.js";
import { ObjectId } from "mongodb";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} - ${detail || ""}`);
    failed++;
  }
}

async function runAudit() {
  console.log("\n=========================================================");
  console.log("  SHOOT LOCATION TECHNICAL AUDIT & TEST SUITE");
  console.log("=========================================================\n");

  // Setup
  const db = await connectToDatabase();
  initAuth(db);
  await seedDatabase();

  // Test User Identities
  const hostUser: AuthenticatedUser = {
    id: "examiner-host-user-id-01",
    email: "examiner@shootlocation.com",
    name: "Examiner Host",
  };

  const creatorUser: AuthenticatedUser = {
    id: "creator-test-user-id-02",
    email: "creator@shootlocation.com",
    name: "Director Sophia",
  };

  const intruderUser: AuthenticatedUser = {
    id: "intruder-user-id-03",
    email: "intruder@shootlocation.com",
    name: "Intruder User",
  };

  console.log("--- 1. Database & Seed Data Audit ---");
  const studios = await StudioService.listStudios({});
  assert(studios.length >= 6, "Seeded studios count is at least 6", `Found ${studios.length}`);
  const examinerAccount = await db.collection("user").findOne({ email: hostUser.email });
  assert(!!examinerAccount, "Examiner host account is seeded and accessible");

  console.log("\n--- 2. Studio CRUD & Ownership Authorization Audit ---");
  // Create Studio
  let createdStudio: any;
  try {
    createdStudio = await StudioService.createStudio(
      {
        title: "Brooklyn Panorama Daylight Loft",
        category: "Photo Studio",
        hourlyRate: 95,
        securityDeposit: 150,
        maxCapacity: 30,
        location: "100 Water St, DUMBO, Brooklyn, NY",
        imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=800&q=80",
        amenities: ["18ft Corner Cyclorama", "High-Speed Fiber WiFi"],
        overview: "A panoramic daylight studio with polished concrete floors and floor to ceiling windows.",
      },
      hostUser
    );
    assert(!!createdStudio._id, "Studio listing successfully created in database");
    assert(createdStudio.hostId === hostUser.id, "Host identity is strictly derived from verified user");
  } catch (e: any) {
    assert(false, "Studio creation failed", e.message);
  }

  // Update Studio by Owner
  try {
    const updated = await StudioService.updateStudio(
      createdStudio._id.toString(),
      { hourlyRate: 115 },
      hostUser
    );
    assert(updated?.hourlyRate === 115, "Owner can successfully update their own studio listing");
  } catch (e: any) {
    assert(false, "Owner update failed", e.message);
  }

  // Reject Update by Non-Owner (Intruder)
  try {
    await StudioService.updateStudio(
      createdStudio._id.toString(),
      { hourlyRate: 200 },
      intruderUser
    );
    assert(false, "Non-owner update should have been rejected with 403");
  } catch (e: any) {
    assert(e.statusCode === 403, "Non-owner update rejected with HTTP 403 Forbidden");
  }

  // Reject Delete by Non-Owner
  try {
    await StudioService.deleteStudio(createdStudio._id.toString(), intruderUser);
    assert(false, "Non-owner delete should have been rejected with 403");
  } catch (e: any) {
    assert(e.statusCode === 403, "Non-owner delete rejected with HTTP 403 Forbidden");
  }

  console.log("\n--- 3. Booking System & Price Calculation Audit ---");
  // Calculate next week date YYYY-MM-DD
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 7);
  const testDateStr = testDate.toISOString().split("T")[0];

  let bookingA: any;
  try {
    bookingA = await BookingService.createBooking(
      {
        studioId: createdStudio._id.toString(),
        bookingDate: testDateStr,
        startTime: "09:00",
        endTime: "13:00", // 4 hours
        notes: "Fashion lookbook editorial shoot",
      },
      creatorUser
    );

    assert(bookingA.duration === 4, "Duration accurately calculated as 4 hours");
    assert(bookingA.rentalAmount === 4 * 115, "Server-side rental amount recalculated accurately ($460)");
    assert(bookingA.securityDeposit === 150, "Security deposit accurately applied ($150)");
    assert(bookingA.totalAmount === 460 + 150, "Total payable accurately calculated as $610");
    assert(bookingA.status === "Pending", "Initial booking status is strictly 'Pending'");
    assert(bookingA.creatorId === creatorUser.id, "Creator identity strictly derived from auth");
  } catch (e: any) {
    assert(false, "Booking creation failed", e.message);
  }

  // Prevent Host from Booking Own Studio
  try {
    await BookingService.createBooking(
      {
        studioId: createdStudio._id.toString(),
        bookingDate: testDateStr,
        startTime: "14:00",
        endTime: "17:00",
      },
      hostUser
    );
    assert(false, "Host booking own studio should have been rejected");
  } catch (e: any) {
    assert(e.statusCode === 400, "Host rejected from booking own studio listing (HTTP 400)");
  }

  console.log("\n--- 4. Double Booking Overlap Prevention (Mandatory Challenge) ---");
  // Confirm Booking A as Host
  try {
    await BookingService.updateBookingStatus(bookingA._id.toString(), "Confirmed", hostUser);
    const confirmedA = await BookingService.getBookingById(bookingA._id.toString());
    assert(confirmedA?.status === "Confirmed", "Host successfully confirmed Booking A (09:00 - 13:00)");
  } catch (e: any) {
    assert(false, "Host confirmation failed", e.message);
  }

  // Attempt Overlapping Booking B (11:00 - 15:00) -> Must be REJECTED!
  try {
    await BookingService.createBooking(
      {
        studioId: createdStudio._id.toString(),
        bookingDate: testDateStr,
        startTime: "11:00", // Overlaps with 09:00 - 13:00
        endTime: "15:00",
      },
      creatorUser
    );
    assert(false, "Overlapping booking request should have been rejected with 409 Conflict");
  } catch (e: any) {
    assert(e.statusCode === 409, "Double booking attempt rejected with HTTP 409 Conflict", e.message);
  }

  // Attempt Non-Overlapping Booking C (14:00 - 18:00) -> Must SUCCEED!
  try {
    const bookingC = await BookingService.createBooking(
      {
        studioId: createdStudio._id.toString(),
        bookingDate: testDateStr,
        startTime: "14:00", // After 13:00 wrap
        endTime: "18:00",
      },
      creatorUser
    );
    assert(!!bookingC._id, "Non-overlapping booking slot (14:00 - 18:00) successfully accepted");
  } catch (e: any) {
    assert(false, "Non-overlapping booking slot failed", e.message);
  }

  console.log("\n--- 5. Booking Status Transitions & Cancellation Audit ---");
  // Non-Host cannot update booking status
  try {
    await BookingService.updateBookingStatus(bookingA._id.toString(), "Completed", intruderUser);
    assert(false, "Intruder updating host booking status should be rejected");
  } catch (e: any) {
    assert(e.statusCode === 403, "Intruder rejected from updating host booking status (HTTP 403)");
  }

  // Host marks Booking A as Completed
  try {
    const completed = await BookingService.updateBookingStatus(bookingA._id.toString(), "Completed", hostUser);
    assert(completed?.status === "Completed", "Host successfully transitioned booking to 'Completed'");
  } catch (e: any) {
    assert(false, "Host marking completed failed", e.message);
  }

  // Delete studio by owner cleanup
  const deleted = await StudioService.deleteStudio(createdStudio._id.toString(), hostUser);
  assert(deleted === true, "Owner successfully deleted studio listing");

  console.log("\n--- 6. JWT Token Security & Cookie Signing Audit ---");
  const testToken = signUserJWT(hostUser);
  assert(typeof testToken === "string" && testToken.length > 20, "JWT signed successfully with secure secret");
  
  // Verify JWT expiration and signature verification
  const { verifyUserJWT } = await import("./config/auth.js");
  const decoded = verifyUserJWT(testToken);
  assert(decoded?.id === hostUser.id && decoded?.email === hostUser.email, "JWT signature and payload verified");

  const invalidTokenResult = verifyUserJWT("tampered.fake.jwt-token");
  assert(invalidTokenResult === null, "Tampered/invalid JWT correctly rejected as null");

  console.log("\n=========================================================");
  console.log(`  AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=========================================================\n");

  await closeDatabase();
  process.exit(failed > 0 ? 1 : 0);
}

runAudit().catch((err) => {
  console.error("Audit suite encountered fatal error:", err);
  process.exit(1);
});
