import { Router } from "express";
import { StudioController } from "../controllers/studio.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Public routes
router.get("/", StudioController.getAll);
router.get("/:id", StudioController.getById);

// Protected routes (MANDATORY JWT SECURITY REQUIREMENT)
router.post("/", requireAuth, StudioController.create);
router.put("/:id", requireAuth, StudioController.update);
router.patch("/:id", requireAuth, StudioController.update);
router.delete("/:id", requireAuth, StudioController.delete);

export default router;
