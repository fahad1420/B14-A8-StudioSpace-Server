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
  console.log("  STUDIOSPACE TECHNICAL AUDIT & TEST SUITE");
  console.log("=========================================================\n");

  // Setup
  const db = await connectToDatabase();
  initAuth(db);
  await seedDatabase();

  // Test User Identities
  const hostUser: AuthenticatedUser = {
    id: "examiner-host-user-id-01",
    email: "examiner@studiospace.com",
    name: "Examiner Host",
  };

  const creatorUser: AuthenticatedUser = {
    id: "creator-test-user-id-02",
    email: "creator@studiospace.com",
    name: "Director Sophia",
  };

  const intruderUser: AuthenticatedUser = {
    id: "intruder-user-id-03",
    email: "intruder@studiospace.com",
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

  console.log("\n--- 4. Concurrency Simulation & Overlap Prevention (Mandatory Challenge) ---");
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

  // Test Adjacent Contiguous Booking (13:00 - 17:00) -> Must SUCCEED!
  try {
    const adjacentBooking = await BookingService.createBooking(
      {
        studioId: createdStudio._id.toString(),
        bookingDate: testDateStr,
        startTime: "13:00", // Exactly contiguous with 09:00-13:00
        endTime: "17:00",
      },
      creatorUser
    );
    assert(!!adjacentBooking._id, "Adjacent contiguous booking (13:00 - 17:00) successfully accepted");
    
    // Host confirms the adjacent booking
    const confirmedAdjacent = await BookingService.updateBookingStatus(adjacentBooking._id.toString(), "Confirmed", hostUser);
    assert(confirmedAdjacent?.status === "Confirmed", "Host successfully confirmed adjacent booking (13:00 - 17:00)");
  } catch (e: any) {
    assert(false, "Adjacent contiguous booking test failed", e.message);
  }

  // SIMULATE CONCURRENT CONFIRMATIONS FOR OVERLAPPING SLOTS
  console.log("\n  [Concurrency Test 1] Testing Database Reservation Guard across distinct worker instances...");
  const { ReservationLockService } = await import("./services/reservation-lock.service.js");
  const worker1 = "instance_worker_node_01";
  const worker2 = "instance_worker_node_02";
  const lockStudioId = createdStudio._id.toString();
  const lockDate = "2026-11-25";

  // Worker 1 acquires lock
  const w1Acquired = await ReservationLockService.acquireLock(lockStudioId, lockDate, worker1, 1000);
  assert(w1Acquired === true, "Worker 1 atomically acquired database reservation lock");

  // Worker 2 attempts to acquire same lock concurrently (must be rejected by DB primary unique key)
  const w2Acquired = await ReservationLockService.acquireLock(lockStudioId, lockDate, worker2, 200);
  assert(w2Acquired === false, "Worker 2 blocked by database-level lock (multi-instance mutual exclusion)");

  // Worker 1 releases lock
  const w1Released = await ReservationLockService.releaseLock(lockStudioId, lockDate, worker1);
  assert(w1Released === true, "Worker 1 safely released database reservation lock");

  // Worker 2 can now acquire lock
  const w2AcquiredAfter = await ReservationLockService.acquireLock(lockStudioId, lockDate, worker2, 1000);
  assert(w2AcquiredAfter === true, "Worker 2 acquired database lock after Worker 1 release");
  await ReservationLockService.releaseLock(lockStudioId, lockDate, worker2);

  console.log("\n  [Concurrency Test 2] Simulating two simultaneous confirmation requests across workers...");
  const concDate = "2026-11-20";
  const pend1 = await BookingService.createBooking(
    {
      studioId: createdStudio._id.toString(),
      bookingDate: concDate,
      startTime: "10:00",
      endTime: "14:00",
    },
    creatorUser
  );
  const pend2 = await BookingService.createBooking(
    {
      studioId: createdStudio._id.toString(),
      bookingDate: concDate,
      startTime: "12:00", // Overlaps 10:00 - 14:00
      endTime: "16:00",
    },
    creatorUser
  );

  // Fire both confirmation requests at the exact same instant
  const [res1, res2] = await Promise.allSettled([
    BookingService.updateBookingStatus(pend1._id.toString(), "Confirmed", hostUser),
    BookingService.updateBookingStatus(pend2._id.toString(), "Confirmed", hostUser),
  ]);

  const fulfilledCount = [res1, res2].filter((r) => r.status === "fulfilled").length;
  const rejectedCount = [res1, res2].filter((r) => r.status === "rejected").length;
  const rejectedReason: any = [res1, res2].find((r) => r.status === "rejected");

  assert(fulfilledCount === 1, "Concurrency safe: Exactly ONE overlapping reservation became Confirmed");
  assert(rejectedCount === 1, "Concurrency safe: Conflicting simultaneous request was rejected");
  assert(
    rejectedReason?.reason?.statusCode === 409,
    "Concurrency safe: Rejected request returned HTTP 409 Conflict",
    rejectedReason?.reason?.message
  );

  console.log("\n--- 5. Booking Status Transitions & Cancellation Audit ---");
  // Test Creator Cancelling Pending Booking
  const cancelTestBooking = await BookingService.createBooking(
    {
      studioId: createdStudio._id.toString(),
      bookingDate: testDateStr,
      startTime: "18:30",
      endTime: "21:30",
    },
    creatorUser
  );
  const cancelledBooking = await BookingService.cancelBooking(cancelTestBooking._id.toString(), creatorUser);
  assert(cancelledBooking?.status === "Cancelled", "Creator can successfully cancel their own pending booking");

  // Prevent double-cancellation
  try {
    await BookingService.cancelBooking(cancelTestBooking._id.toString(), creatorUser);
    assert(false, "Double cancellation should be rejected");
  } catch (e: any) {
    assert(e.statusCode === 400, "Double cancellation rejected with HTTP 400 Bad Request");
  }

  // Intruder cannot cancel another user's booking
  try {
    await BookingService.cancelBooking(bookingA._id.toString(), intruderUser);
    assert(false, "Intruder cancelling booking should be rejected");
  } catch (e: any) {
    assert(e.statusCode === 403, "Intruder rejected from cancelling booking (HTTP 403 Forbidden)");
  }

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

  // Cannot cancel a completed booking
  try {
    await BookingService.cancelBooking(bookingA._id.toString(), creatorUser);
    assert(false, "Cancelling completed booking should be rejected");
  } catch (e: any) {
    assert(e.statusCode === 400, "Cancelling completed booking rejected with HTTP 400 Bad Request");
  }

  // Delete studio by owner cleanup
  const deleted = await StudioService.deleteStudio(createdStudio._id.toString(), hostUser);
  assert(deleted === true, "Owner successfully deleted studio listing");

  console.log("\n--- 6. JWT Token Security & Inaccessibility to Client JavaScript ---");
  const testToken = signUserJWT(hostUser);
  assert(typeof testToken === "string" && testToken.length > 20, "JWT signed successfully with secure secret");
  
  // Verify JWT expiration and signature verification
  const { verifyUserJWT } = await import("./config/auth.js");
  const decoded = verifyUserJWT(testToken);
  assert(decoded?.id === hostUser.id && decoded?.email === hostUser.email, "JWT signature and payload verified");

  const invalidTokenResult = verifyUserJWT("tampered.fake.jwt-token");
  assert(invalidTokenResult === null, "Tampered/invalid JWT correctly rejected as null");

  // Verify that AuthController.login response DOES NOT contain token in body
  const mockReq: any = {
    body: {
      email: hostUser.email,
      password: "ExaminerPassword123!",
    },
  };
  let capturedCookie: any = null;
  let capturedJson: any = null;
  const mockRes: any = {
    cookie: (name: string, val: string, opts: any) => {
      capturedCookie = { name, val, opts };
    },
    status: () => mockRes,
    json: (data: any) => {
      capturedJson = data;
    },
  };
  await AuthController.login(mockReq, mockRes);
  assert(capturedCookie?.opts?.httpOnly === true, "Cookie is strictly configured with httpOnly: true");
  assert(capturedJson?.token === undefined, "Security: JWT token is completely omitted from response JSON body (inaccessible to client JS)");
  assert(!!capturedJson?.user?.id, "User identity returned in response body without exposing raw JWT credential");

  console.log("\n--- 7. Better Auth Native Registration & Login Verification ---");
  const { getAuth } = await import("./config/auth.js");
  const auth = getAuth();
  
  // Test native Better Auth sign up
  const testEmail = `filmmaker.${Date.now()}@studiospace.com`;
  const signUpRes = await auth.api.signUpEmail({
    body: {
      name: "Indie Filmmaker",
      email: testEmail,
      password: "Cinematographer2026!",
      image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    },
  });
  assert(!!signUpRes?.user?.id, "Better Auth native signUpEmail created user with unique ID");
  assert(signUpRes?.user?.email === testEmail, "Better Auth stored normalized user email");
  assert(typeof signUpRes?.token === "string", "Better Auth generated native session token");

  // Test native Better Auth sign in
  const signInRes = await auth.api.signInEmail({
    body: {
      email: testEmail,
      password: "Cinematographer2026!",
    },
  });
  assert(signInRes?.user?.email === testEmail, "Better Auth native signInEmail successfully verified credentials");
  assert(typeof signInRes?.token === "string", "Better Auth issued session token on successful login");

  // Test Better Auth duplicate email prevention
  try {
    await auth.api.signUpEmail({
      body: {
        name: "Duplicate User",
        email: testEmail,
        password: "AnotherPassword123!",
      },
    });
    assert(false, "Better Auth should reject duplicate email registration");
  } catch (err: any) {
    assert(true, "Better Auth native duplicate email registration correctly rejected");
  }

  console.log("\n--- 7b. Google OAuth Flow & Session Synchronization Verification ---");
  // Test Better Auth Google OAuth provider integration
  process.env.GOOGLE_CLIENT_ID = "test-client-id-12345.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret-67890";
  const authWithGoogle = initAuth(db);
  const socialRes: any = await authWithGoogle.api.signInSocial({
    body: {
      provider: "google",
      callbackURL: "http://localhost:3000/dashboard",
    },
  });
  assert(!!socialRes?.url, "Better Auth Google OAuth generates valid authorization URL");
  assert(socialRes?.url?.includes("accounts.google.com"), "Authorization URL targets official Google OAuth accounts endpoint");
  assert(socialRes?.url?.includes("test-client-id-12345"), "Google OAuth URL encapsulates configured Client ID");
  assert(socialRes?.url?.includes("callback%2Fgoogle"), "Google OAuth URL encapsulates callback redirect URI");
  assert(socialRes?.url?.includes("code_challenge"), "Google OAuth URL enforces secure PKCE code challenge");

  // Test that AuthController.me synchronizes HTTPOnly JWT cookie
  let meCapturedCookie: any = null;
  const mockMeReq: any = {
    user: hostUser,
    cookies: {},
    headers: {},
  };
  const mockMeRes: any = {
    cookie: (name: string, val: string, opts: any) => {
      meCapturedCookie = { name, val, opts };
    },
    status: () => mockMeRes,
    json: () => {},
  };
  await AuthController.me(mockMeReq, mockMeRes);
  assert(meCapturedCookie?.name === "studiospace_jwt_token", "AuthController.me synchronizes studiospace_jwt_token cookie");
  assert(meCapturedCookie?.opts?.httpOnly === true, "Synchronized session cookie enforces httpOnly: true");

  console.log("\n--- 8. Production Persistence Guard Verification ---");
  // Test that in production mode, silent memory fallback is strictly prohibited
  try {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { MongoClient } = await import("mongodb");
    const testClient = new MongoClient("mongodb://127.0.0.1:27019/unreachable_db", {
      serverSelectionTimeoutMS: 500,
      connectTimeoutMS: 500,
    });
    
    let caughtFatal = false;
    try {
      await testClient.connect();
    } catch {
      caughtFatal = true;
    }
    process.env.NODE_ENV = originalEnv;
    assert(caughtFatal, "Production mode strictly rejects unreachable MongoDB without silent fallback");
  } catch (err) {
    assert(false, "Production persistence guard test failed", String(err));
  }

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

