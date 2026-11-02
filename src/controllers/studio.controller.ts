import { Request, Response } from "express";
import { StudioService } from "../services/studio.service.js";

export class StudioController {
  static async getAll(req: Request, res: Response) {
    try {
      const { search, category, location, minPrice, maxPrice, sort, limit, hostId } = req.query;

      const studios = await StudioService.listStudios({
        search: search as string,
        category: category as string,
        location: location as string,
        minPrice: minPrice ? Number(minPrice) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        sort: sort as string,
        limit: limit ? Number(limit) : undefined,
        hostId: hostId as string,
      });

      res.status(200).json({
        success: true,
        data: studios,
        count: studios.length,
      });
    } catch (error: any) {
      console.error("[StudioController.getAll] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve studios",
      });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const studio = await StudioService.getStudioById(id);

      if (!studio) {
        return res.status(404).json({
          success: false,
          message: "Studio not found",
        });
      }

      res.status(200).json({
        success: true,
        data: studio,
      });
    } catch (error: any) {
      console.error("[StudioController.getById] Error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve studio",
      });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to create a studio listing",
        });
      }

      const created = await StudioService.createStudio(req.body, req.user);

      res.status(201).json({
        success: true,
        message: "Studio listing created successfully",
        data: created,
      });
    } catch (error: any) {
      console.error("[StudioController.create] Error:", error);
      res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Failed to create studio listing",
        errors: error.errors || undefined,
      });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to update a studio",
        });
      }

      const { id } = req.params;
      const updated = await StudioService.updateStudio(id, req.body, req.user);

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Studio not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Studio updated successfully",
        data: updated,
      });
    } catch (error: any) {
      console.error("[StudioController.update] Error:", error);
      res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Failed to update studio",
      });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: You must be logged in to delete a studio",
        });
      }

      const { id } = req.params;
      const deleted = await StudioService.deleteStudio(id, req.user);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Studio not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Studio listing deleted successfully",
      });
    } catch (error: any) {
      console.error("[StudioController.delete] Error:", error);
      res.status(error.statusCode || 400).json({
        success: false,
        message: error.message || "Failed to delete studio",
      });
    }
  }
}
