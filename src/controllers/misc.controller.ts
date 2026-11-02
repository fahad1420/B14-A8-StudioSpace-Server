import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDatabase } from "../config/db.js";
import { z } from "zod";

const NewsletterSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export class MiscController {
  static async subscribeNewsletter(req: Request, res: Response) {
    try {
      const validated = NewsletterSchema.parse(req.body);
      const db = getDatabase();
      const collection = db.collection("newsletters");

      const existing = await collection.findOne({ email: validated.email.toLowerCase() });
      if (existing) {
        return res.status(200).json({
          success: true,
          message: "You are already subscribed to the Shoot Location creative digest.",
        });
      }

      await collection.insertOne({
        email: validated.email.toLowerCase(),
        subscribedAt: new Date(),
      });

      res.status(201).json({
        success: true,
        message: "Thank you for subscribing! You will receive our curated studio drops and production insights.",
      });
    } catch (error: any) {
      console.error("[MiscController.subscribeNewsletter] Error:", error);
      res.status(400).json({
        success: false,
        message: error.message || "Failed to process newsletter subscription",
      });
    }
  }

  static async getWishlist(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Please log in to view saved studios",
        });
      }

      const db = getDatabase();
      const wishlists = await db.collection("wishlists")
        .find({ userId: req.user.id })
        .toArray();

      const studioIds = wishlists
        .map((w: any) => w.studioId)
        .filter((id: any) => ObjectId.isValid(id))
        .map((id: any) => new ObjectId(id));

      const studios = studioIds.length > 0
        ? await db.collection("studios").find({ _id: { $in: studioIds } }).toArray()
        : [];

      res.status(200).json({
        success: true,
        data: studios,
        savedIds: wishlists.map((w: any) => w.studioId),
      });
    } catch (error: any) {
      console.error("[MiscController.getWishlist] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve wishlist",
      });
    }
  }

  static async toggleWishlist(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Please log in to save studios",
        });
      }

      const { studioId } = req.body;
      if (!studioId) {
        return res.status(400).json({
          success: false,
          message: "studioId is required",
        });
      }

      const db = getDatabase();
      const collection = db.collection("wishlists");

      const existing = await collection.findOne({
        userId: req.user.id,
        studioId,
      });

      if (existing) {
        await collection.deleteOne({ _id: existing._id });
        return res.status(200).json({
          success: true,
          saved: false,
          message: "Removed from saved studios",
        });
      } else {
        await collection.insertOne({
          userId: req.user.id,
          studioId,
          createdAt: new Date(),
        });
        return res.status(201).json({
          success: true,
          saved: true,
          message: "Saved to your favorite studios",
        });
      }
    } catch (error: any) {
      console.error("[MiscController.toggleWishlist] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to toggle wishlist",
      });
    }
  }
}

