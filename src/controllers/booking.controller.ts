import { Request, Response } from "express";
import { BookingService } from "../services/booking.service.js";

export class BookingController {
  static async create(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to book a studio",
        });
      }

      const booking = await BookingService.createBooking(req.body, req.user);

      res.status(201).json({
        success: true,
        message: "Studio booking request submitted successfully. Status is Pending.",
        data: booking,
      });
    } catch (error: any) {
      console.error("[BookingController.create] Error:", error);
      res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Failed to create studio booking",
        errors: error.errors || undefined,
      });
    }
  }

  static async getMyBookings(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to view your bookings",
        });
      }

      const bookings = await BookingService.getMyBookings(req.user.id);

      res.status(200).json({
        success: true,
        data: bookings,
        count: bookings.length,
      });
    } catch (error: any) {
      console.error("[BookingController.getMyBookings] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve your bookings",
      });
    }
  }

  static async getHostBookings(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to view incoming booking requests",
        });
      }

      const bookings = await BookingService.getHostBookings(req.user.id);

      res.status(200).json({
        success: true,
        data: bookings,
        count: bookings.length,
      });
    } catch (error: any) {
      console.error("[BookingController.getHostBookings] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve incoming host bookings",
      });
    }
  }

  static async cancel(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to cancel a booking",
        });
      }

      const { id } = req.params;
      const updated = await BookingService.cancelBooking(id, req.user);

      res.status(200).json({
        success: true,
        message: "Booking has been cancelled successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("[BookingController.cancel] Error:", error);
      res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Failed to cancel booking",
      });
    }
  }

  static async updateStatus(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to update booking status",
        });
      }

      const { id } = req.params;
      const { status } = req.body;

      if (!status || !["Confirmed", "Cancelled", "Completed"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status value. Must be Confirmed, Cancelled, or Completed.",
        });
      }

      const updated = await BookingService.updateBookingStatus(id, status, req.user);

      res.status(200).json({
        success: true,
        message: `Booking status updated to ${status}`,
        data: updated,
      });
    } catch (error: any) {
      console.error("[BookingController.updateStatus] Error:", error);
      res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Failed to update booking status",
      });
    }
  }
}
