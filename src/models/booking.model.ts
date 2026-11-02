import { z } from "zod";
import { ObjectId } from "mongodb";

export const BookingStatusEnum = z.enum(["Pending", "Confirmed", "Completed", "Cancelled"]);
export type BookingStatus = z.infer<typeof BookingStatusEnum>;

export const CreateBookingSchema = z.object({
  studioId: z.string().min(1, "Studio ID is required"),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Booking date must be in YYYY-MM-DD format"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:mm (24-hour format)"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "End time must be HH:mm (24-hour format)"),
  notes: z.string().max(500).optional(),
}).refine((data) => {
  const [startH, startM] = data.startTime.split(":").map(Number);
  const [endH, endM] = data.endTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return endMinutes > startMinutes;
}, {
  message: "End time must be later than start time",
  path: ["endTime"],
}).refine((data) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bookingDate = new Date(`${data.bookingDate}T00:00:00`);
  return bookingDate >= today;
}, {
  message: "Booking date cannot be in the past",
  path: ["bookingDate"],
});

export interface BookingDocument {
  _id?: ObjectId | string;
  studioId: string;
  studioTitle: string;
  studioImage: string;
  studioLocation: string;
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  creatorImage?: string;
  hostId: string;
  hostName: string;
  hostEmail: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  duration: number; // hours (decimal or integer, e.g. 3 or 3.5)
  hourlyRate: number;
  rentalAmount: number;
  securityDeposit: number;
  totalAmount: number;
  status: BookingStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
