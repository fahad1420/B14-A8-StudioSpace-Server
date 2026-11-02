import { getDatabase } from "../config/db.js";
import crypto from "crypto";

export interface ReservationLockDoc {
  _id: string; // lock:<studioId>:<bookingDate>
  studioId: string;
  bookingDate: string;
  ownerId: string;
  expireAt: Date;
  acquiredAt: Date;
}

/**
 * Production-Safe Distributed Reservation Guard
 *
 * Implements atomic distributed mutual exclusion across multiple Node.js instances
 * using MongoDB's unique index constraint and atomic conditional updates.
 */
export class ReservationLockService {
  private static collection() {
    return getDatabase().collection("reservation_locks");
  }

  /**
   * Generates a unique worker/instance identifier for distributed coordination.
   */
  static generateWorkerId(prefix: string = "instance"): string {
    return `${prefix}_pid${process.pid}_${crypto.randomUUID().substring(0, 8)}`;
  }

  /**
   * Attempts atomic acquisition of the distributed lock for studioId + bookingDate.
   * If held by another active worker instance, retries with jitter until timeout.
   */
  static async acquireLock(
    studioId: string,
    bookingDate: string,
    ownerId: string,
    timeoutMs: number = 6000,
    leaseTtlMs: number = 15000
  ): Promise<boolean> {
    const lockKey = `lock:${studioId}:${bookingDate}`;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const now = new Date();
      const expireAt = new Date(Date.now() + leaseTtlMs);

      // 1. Attempt atomic insert (enforces exclusivity via MongoDB primary unique key)
      try {
        await this.collection().insertOne({
          _id: lockKey,
          studioId,
          bookingDate,
          ownerId,
          expireAt,
          acquiredAt: now,
        });
        return true;
      } catch (err: any) {
        const isDuplicate =
          err.code === 11000 ||
          err.message?.includes("E11000") ||
          err.message?.includes("duplicate key");

        if (!isDuplicate) {
          throw err;
        }
      }

      // 2. Check if the existing lock has expired (stale lock due to worker crash/timeout)
      const nowTime = new Date();
      const stealResult = await this.collection().updateOne(
        {
          _id: lockKey,
          expireAt: { $lt: nowTime },
        },
        {
          $set: {
            ownerId,
            expireAt,
            acquiredAt: nowTime,
          },
        }
      );

      if (stealResult && stealResult.modifiedCount > 0) {
        return true;
      }

      // 3. Jittered sleep before next attempt (25ms - 55ms)
      const jitter = 25 + Math.floor(Math.random() * 30);
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }

    return false;
  }

  /**
   * Safely releases the distributed lock (only if still owned by this worker instance).
   */
  static async releaseLock(
    studioId: string,
    bookingDate: string,
    ownerId: string
  ): Promise<boolean> {
    const lockKey = `lock:${studioId}:${bookingDate}`;
    const result = await this.collection().deleteOne({
      _id: lockKey,
      ownerId,
    });
    return result.deletedCount > 0;
  }

  /**
   * High-level coordinator: acquires the database-level lock across instances,
   * runs the critical section, and guarantees safe release.
   */
  static async runExclusive<T>(
    studioId: string,
    bookingDate: string,
    workerId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const acquired = await this.acquireLock(studioId, bookingDate, workerId);
    if (!acquired) {
      const err: any = new Error(
        "Could not acquire reservation lock: Another server instance is currently processing reservations for this studio and date. Please try again."
      );
      err.statusCode = 409;
      throw err;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(studioId, bookingDate, workerId);
    }
  }
}

