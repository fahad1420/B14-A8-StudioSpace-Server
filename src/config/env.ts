import dotenv from "dotenv";
import path from "path";

dotenv.config();

function normalizeUrl(url: string | undefined, defaultUrl: string): string {
  if (!url || url.trim() === "") return defaultUrl;
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/studiospace",
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || "studiospace",
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "studiospace-secure-jwt-auth-secret-key-32chars-min",
  BETTER_AUTH_URL: normalizeUrl(process.env.BETTER_AUTH_URL, "http://localhost:5000"),
  FRONTEND_URL: normalizeUrl(process.env.FRONTEND_URL, "http://localhost:3000"),
  JWT_SECRET: process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || "studiospace-secure-jwt-auth-secret-key-32chars-min",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  COOKIE_NAME: "studiospace_jwt_token",
  IS_PRODUCTION: process.env.NODE_ENV === "production",
};

// Production Security Guard: Enforce genuine non-fallback secrets in production
if (ENV.IS_PRODUCTION) {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET === "studiospace-secure-jwt-auth-secret-key-32chars-min" ||
    process.env.BETTER_AUTH_SECRET.length < 32
  ) {
    throw new Error(
      "[Security FATAL] BETTER_AUTH_SECRET must be explicitly configured with a 32+ character random string in production environment."
    );
  }
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === "studiospace-secure-jwt-auth-secret-key-32chars-min" ||
    process.env.JWT_SECRET.length < 32
  ) {
    throw new Error(
      "[Security FATAL] JWT_SECRET must be explicitly configured with a 32+ character random string in production environment."
    );
  }
}
