import { ObjectId, Filter } from "mongodb";
import { getDatabase } from "../config/db.js";
import { CreateStudioSchema, StudioDocument, UpdateStudioSchema } from "../models/studio.model.js";

export interface StudioFilterQuery {
  search?: string;
  category?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  limit?: number;
  hostId?: string;
}

export class StudioService {
  private static collection() {
    return getDatabase().collection("studios");
  }

  static async listStudios(filters: StudioFilterQuery) {
    const query: Filter<StudioDocument> = {};

    if (filters.hostId) {
      query.hostId = filters.hostId;
    }

    if (filters.category && filters.category !== "All") {
      // Handle category aliases if needed
      if (filters.category === "Podcast Rooms") {
        query.category = "Podcast Lounge";
      } else if (filters.category === "Art Workshops") {
        query.category = "Workshop";
      } else {
        query.category = filters.category as any;
      }
    }

    if (filters.search && filters.search.trim() !== "") {
      const searchRegex = new RegExp(filters.search.trim(), "i");
      query.$or = [
        { title: { $regex: searchRegex } },
        { location: { $regex: searchRegex } },
        { overview: { $regex: searchRegex } },
      ];
    }

    if (filters.location && filters.location.trim() !== "") {
      query.location = { $regex: new RegExp(filters.location.trim(), "i") };
    }

    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      query.hourlyRate = {};
      if (filters.minPrice !== undefined && !isNaN(filters.minPrice)) {
        query.hourlyRate.$gte = Number(filters.minPrice);
      }
      if (filters.maxPrice !== undefined && !isNaN(filters.maxPrice)) {
        query.hourlyRate.$lte = Number(filters.maxPrice);
      }
    }

    let sortOption: any = { createdAt: -1 };
    if (filters.sort === "price_asc") {
      sortOption = { hourlyRate: 1 };
    } else if (filters.sort === "price_desc") {
      sortOption = { hourlyRate: -1 };
    } else if (filters.sort === "rating") {
      sortOption = { rating: -1, reviewCount: -1 };
    } else if (filters.sort === "newest") {
      sortOption = { createdAt: -1 };
    }

    let cursor = this.collection().find(query).sort(sortOption);

    if (filters.limit && filters.limit > 0) {
      cursor = cursor.limit(Number(filters.limit));
    }

    const studios = await cursor.toArray();
    return studios;
  }

  static async getStudioById(id: string) {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return this.collection().findOne({ _id: new ObjectId(id) });
  }

  static async createStudio(
    data: any,
    user: { id: string; name: string; email: string; image?: string }
  ) {
    const validated = CreateStudioSchema.parse(data);

    const newStudio: StudioDocument = {
      ...validated,
      hostId: user.id,
      hostName: user.name,
      hostEmail: user.email,
      hostImage: user.image,
      rating: 4.9,
      reviewCount: 0,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await this.collection().insertOne(newStudio as any);
    return { ...newStudio, _id: result.insertedId };
  }

  static async updateStudio(
    id: string,
    data: any,
    user: { id: string }
  ) {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid studio ID format");
    }

    const studio = await this.collection().findOne({ _id: new ObjectId(id) });
    if (!studio) {
      return null;
    }

    if (studio.hostId !== user.id) {
      const error: any = new Error("Forbidden: You do not have permission to modify this studio");
      error.statusCode = 403;
      throw error;
    }

    const validated = UpdateStudioSchema.parse(data);

    const updateDoc = {
      ...validated,
      updatedAt: new Date(),
    };

    await this.collection().updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    return this.collection().findOne({ _id: new ObjectId(id) });
  }

  static async deleteStudio(id: string, user: { id: string }) {
    if (!ObjectId.isValid(id)) {
      throw new Error("Invalid studio ID format");
    }

    const studio = await this.collection().findOne({ _id: new ObjectId(id) });
    if (!studio) {
      return null;
    }

    if (studio.hostId !== user.id) {
      const error: any = new Error("Forbidden: You do not have permission to delete this studio");
      error.statusCode = 403;
      throw error;
    }

    const result = await this.collection().deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount > 0;
  }
}

