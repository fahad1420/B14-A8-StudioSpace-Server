import { ObjectId } from "mongodb";
import { getDatabase } from "../config/db.js";
import { CreateBookingSchema, BookingDocument, BookingStatus } from "../models/booking.model.js";
import { StudioDocument } from "../models/studio.model.js";
import { ReservationLockService } from "./reservation-lock.service.js";

export class BookingService {
  private static collection() {
    return getDatabase().collection("bookings");
  }

  private static studioCollection() {
    return getDatabase().collection("studios");
  }

  /**
   * Calculates duration in hours between two HH:mm strings
   */
  static calculateDuration(startTime: string, endTime: string): number {
    const [startH, startM] = startTime.split(":").map(Number);
    const [endH, endM] = endTime.split(":").map(Number);
    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;
    const diffMinutes = endTotal - startTotal;
    return Math.round((diffMinutes / 60) * 100) / 100;
  }

  /**
   * Checks if an interval [startA, endA] overlaps with [startB, endB]
   */
  static isTimeOverlapping(startA: string, endA: string, startB: string, endB: string): boolean {
    return startA < endB && endA > startB;
  }

  /**
   * Check if a studio is already booked with 'Confirmed' status for the given date and time range
   */
  static async checkConfirmedConflict(
    studioId: string,
    bookingDate: string,
    startTime: string,
    endTime: string,
    excludeBookingId?: string
  ): Promise<boolean> {
    const query: any = {
      studioId,
      bookingDate,
      status: "Confirmed",
    };

    if (excludeBookingId && ObjectId.isValid(excludeBookingId)) {
      query._id = { $ne: new ObjectId(excludeBookingId) };
    }

    const existingConfirmed = await this.collection().find(query).toArray();

    for (const existing of existingConfirmed) {
      if (this.isTimeOverlapping(startTime, endTime, existing.startTime, existing.endTime)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a new booking with Pending status
   */
  static async createBooking(
    payload: any,
    user: { id: string; name: string; email: string; image?: string }
  ) {
    const validated = CreateBookingSchema.parse(payload);

    if (!ObjectId.isValid(validated.studioId)) {
      const err: any = new Error("Invalid studio ID format");
      err.statusCode = 400;
      throw err;
    }

    // 1. Fetch real studio record from DB
    const studio = await this.studioCollection().findOne({ _id: new ObjectId(validated.studioId) });
    if (!studio) {
      const err: any = new Error("Studio not found");
      err.statusCode = 404;
      throw err;
    }

    // 2. Prevent user from booking their own studio
    if (studio.hostId === user.id) {
      const err: any = new Error("You cannot book your own studio");
      err.statusCode = 400;
      throw err;
    }

    // 3. Double Booking Prevention: Check for confirmed time overlap
    const hasConflict = await this.checkConfirmedConflict(
      validated.studioId,
      validated.bookingDate,
      validated.startTime,
      validated.endTime
    );

    if (hasConflict) {
      const err: any = new Error(
        `The studio is already reserved for the requested time slot (${validated.startTime} - ${validated.endTime}) on ${validated.bookingDate}. Please choose a different time.`
      );
      err.statusCode = 409;
      throw err;
    }

    // 4. Recalculate duration & monetary values independently on server
    const duration = this.calculateDuration(validated.startTime, validated.endTime);
    if (duration <= 0) {
      const err: any = new Error("Duration must be greater than 0 hours");
      err.statusCode = 400;
      throw err;
    }

    const hourlyRate = studio.hourlyRate;
    const rentalAmount = Math.round(duration * hourlyRate * 100) / 100;
    const securityDeposit = studio.securityDeposit || 0;
    const totalAmount = Math.round((rentalAmount + securityDeposit) * 100) / 100;

    const newBooking: BookingDocument = {
      studioId: validated.studioId,
      studioTitle: studio.title,
      studioImage: studio.imageUrl,
      studioLocation: studio.location,
      creatorId: user.id,
      creatorName: user.name,
      creatorEmail: user.email,
      creatorImage: user.image,
      hostId: studio.hostId,
      hostName: studio.hostName,
      hostEmail: studio.hostEmail,
      bookingDate: validated.bookingDate,
      startTime: validated.startTime,
      endTime: validated.endTime,
      duration,
      hourlyRate,
      rentalAmount,
      securityDeposit,
      totalAmount,
      status: "Pending",
      notes: validated.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.collection().insertOne(newBooking as any);
    return { ...newBooking, _id: result.insertedId };
  }

  /**
   * Get user's own bookings (as creator)
   */
  static async getMyBookings(userId: string) {
    return this.collection()
      .find({ creatorId: userId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Get bookings for studios owned by host
   */
  static async getHostBookings(hostId: string) {
    return this.collection()
      .find({ hostId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  /**
   * Get single booking by ID
   */
  static async getBookingById(id: string) {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return this.collection().findOne({ _id: new ObjectId(id) });
  }

  /**
   * Cancel booking (creator or host)
   */
  static async cancelBooking(id: string, user: { id: string }) {
    if (!ObjectId.isValid(id)) {
      const err: any = new Error("Invalid booking ID format");
      err.statusCode = 400;
      throw err;
    }

    const booking = await this.collection().findOne({ _id: new ObjectId(id) });
    if (!booking) {
      const err: any = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    // Only creator or host can cancel
    if (booking.creatorId !== user.id && booking.hostId !== user.id) {
      const err: any = new Error("Forbidden: You are not authorized to cancel this booking");
      err.statusCode = 403;
      throw err;
    }

    if (booking.status === "Cancelled") {
      const err: any = new Error("Booking is already cancelled");
      err.statusCode = 400;
      throw err;
    }

    if (booking.status === "Completed") {
      const err: any = new Error("Cannot cancel a completed booking");
      err.statusCode = 400;
      throw err;
    }

    await this.collection().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Cancelled", updatedAt: new Date() } }
    );

    return this.collection().findOne({ _id: new ObjectId(id) });
  }

  /**
   * Host updates booking status (Confirm, Cancel, Complete)
   */
  static async updateBookingStatus(
    id: string,
    newStatus: BookingStatus,
    hostUser: { id: string }
  ) {
    if (!ObjectId.isValid(id)) {
      const err: any = new Error("Invalid booking ID format");
      err.statusCode = 400;
      throw err;
    }

    const booking = await this.collection().findOne({ _id: new ObjectId(id) });
    if (!booking) {
      const err: any = new Error("Booking not found");
      err.statusCode = 404;
      throw err;
    }

    // Only the host can manage booking status
    if (booking.hostId !== hostUser.id) {
      const err: any = new Error("Forbidden: Only the studio host can update this booking status");
      err.statusCode = 403;
      throw err;
    }

    // If confirming, coordinate through database-level distributed lock across instances
    if (newStatus === "Confirmed") {
      const workerId = ReservationLockService.generateWorkerId("host_confirm");
      return ReservationLockService.runExclusive(
        booking.studioId,
        booking.bookingDate,
        workerId,
        async () => {
          // Re-read booking inside database critical section
          const currentBooking = await this.collection().findOne({ _id: new ObjectId(id) });
          if (!currentBooking) {
            const err: any = new Error("Booking not found");
            err.statusCode = 404;
            throw err;
          }

          if (currentBooking.status === "Confirmed") {
            return currentBooking; // Already confirmed
          }

          if (currentBooking.status === "Cancelled" || currentBooking.status === "Rejected") {
            const err: any = new Error(`Cannot confirm a booking that is currently ${currentBooking.status}`);
            err.statusCode = 400;
            throw err;
          }

          const hasConflict = await this.checkConfirmedConflict(
            currentBooking.studioId,
            currentBooking.bookingDate,
            currentBooking.startTime,
            currentBooking.endTime,
            id
          );

          if (hasConflict) {
            const err: any = new Error(
              "Cannot confirm booking: Another confirmed booking already occupies this time slot."
            );
            err.statusCode = 409;
            throw err;
          }

          await this.collection().updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: "Confirmed", updatedAt: new Date() } }
          );

          return this.collection().findOne({ _id: new ObjectId(id) });
        }
      );
    }

    await this.collection().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: newStatus, updatedAt: new Date() } }
    );

    return this.collection().findOne({ _id: new ObjectId(id) });
  }
}

