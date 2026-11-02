import { z } from "zod";
import { ObjectId } from "mongodb";

export const StudioCategoryEnum = z.enum([
  "Photo Studio",
  "Sound Stage",
  "Podcast Lounge",
  "Music Suite",
  "Workshop",
]);

export type StudioCategory = z.infer<typeof StudioCategoryEnum>;

export const CreateStudioSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  category: StudioCategoryEnum,
  hourlyRate: z.coerce.number().min(10, "Hourly rate must be at least $10").max(5000),
  securityDeposit: z.coerce.number().min(0, "Security deposit cannot be negative").max(10000),
  maxCapacity: z.coerce.number().int().min(1, "Capacity must be at least 1 person").max(500),
  location: z.string().min(3, "Location address is required"),
  imageUrl: z.string().url("Valid image URL is required"),
  gallery: z.array(z.string().url()).optional().default([]),
  amenities: z.array(z.string()).min(1, "Select at least one amenity"),
  overview: z.string().min(20, "Overview must be at least 20 characters"),
});

export const UpdateStudioSchema = CreateStudioSchema.partial();

export interface StudioDocument {
  _id?: ObjectId | string;
  title: string;
  category: StudioCategory;
  hourlyRate: number;
  securityDeposit: number;
  maxCapacity: number;
  location: string;
  imageUrl: string;
  gallery: string[];
  amenities: string[];
  overview: string;
  hostId: string;
  hostName: string;
  hostEmail: string;
  hostImage?: string;
  rating: number;
  reviewCount: number;
  status: "active" | "inactive";
  createdAt: Date;
  updatedAt: Date;
}
