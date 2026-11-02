import { Router } from "express";
import { MiscController } from "../controllers/misc.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/newsletter", MiscController.subscribeNewsletter);
router.get("/wishlist", requireAuth, MiscController.getWishlist);
router.post("/wishlist/toggle", requireAuth, MiscController.toggleWishlist);

export default router;
