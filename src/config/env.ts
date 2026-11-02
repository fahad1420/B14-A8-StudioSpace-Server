import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shoot_location",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "shoot_location",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "shoot-location-secure-jwt-auth-secret-key-32chars-min",
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || "http://localhost:5000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  JWT_SECRET: process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || "shoot-location-secure-jwt-auth-secret-key-32chars-min",
  COOKIE_NAME: "shoot_session_token",
  IS_PRODUCTION: process.env.NODE_ENV === "production",
};
