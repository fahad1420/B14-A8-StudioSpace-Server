import { Router } from "express";
import { BookingController } from "../controllers/booking.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Protected booking endpoints (MANDATORY JWT SECURITY REQUIREMENT)
router.post("/", requireAuth, BookingController.create);
router.get("/my", requireAuth, BookingController.getMyBookings);
router.get("/host", requireAuth, BookingController.getHostBookings);
router.patch("/:id/cancel", requireAuth, BookingController.cancel);
router.patch("/:id/status", requireAuth, BookingController.updateStatus);

export default router;
