import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";
import { connectToDatabase, closeDatabase } from "./config/db.js";
import { initAuth } from "./config/auth.js";
import { ENV } from "./config/env.js";
import { seedDatabase } from "./seed.js";

import studioRoutes from "./routes/studio.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import authRoutes from "./routes/auth.routes.js";
import miscRoutes from "./routes/misc.routes.js";

const app = express();

// Allowed origins for CORS (Credentialed)
const allowedOrigins = [
  ENV.FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://studiospace.vercel.app",
  "https://thestudiospace.vercel.app",
  "https://studiospacehq.vercel.app",
  "https://studiospacecreative.vercel.app",
  "https://mystudiospace.vercel.app",
  "https://shootlocation.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      const isVercelStudio =
        origin.endsWith(".vercel.app") &&
        (origin.includes("studiospace") || origin.includes("shootlocation"));
      if (allowedOrigins.includes(origin) || isVercelStudio || !ENV.IS_PRODUCTION) {
        return callback(null, origin);
      }
      return callback(new Error(`CORS policy violation: ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Server startup orchestrator
async function startServer() {
  try {
    // 1. Connect to Database
    const db = await connectToDatabase();

    // 2. Initialize Better Auth with Database instance
    const auth = initAuth(db);

    // 3. Mount Better Auth standard node handler
    app.all("/api/auth/*", (req, res, next) => {
      // Skip custom auth endpoints if they match our custom route handlers
      if (
        req.path === "/api/auth/register" ||
        req.path === "/api/auth/login" ||
        req.path === "/api/auth/logout" ||
        req.path === "/api/auth/me" ||
        req.path === "/api/auth/sync-social"
      ) {
        return next();
      }
      return toNodeHandler(auth as any)(req, res);
    });

    // 4. Mount API Routes
    app.use("/api/auth", authRoutes);
    app.use("/api/studios", studioRoutes);
    app.use("/api/bookings", bookingRoutes);
    app.use("/api", miscRoutes);

    // Healthcheck
    app.get("/api/health", (_req, res) => {
      res.status(200).json({
        status: "ok",
        brand: "STUDIOSPACE",
        tagline: "Find Your Space. Create Your Story.",
        environment: ENV.NODE_ENV,
        timestamp: new Date().toISOString(),
      });
    });

    // Root info
    app.get("/", (_req, res) => {
      res.status(200).json({
        name: "B14-A8 | StudioSpace Server",
        version: "1.0.0",
        brand: "STUDIOSPACE",
        docs: "/api/health",
      });
    });

    // 404 Handler
    app.use((_req, res) => {
      res.status(404).json({
        success: false,
        message: "Endpoint not found",
      });
    });

    // Global Error Handler
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error("[ServerError]", err);
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        message: err.message || "Internal server error occurred",
      });
    });

    // Auto-seed if database is empty
    try {
      await seedDatabase();
    } catch (seedErr) {
      console.warn("[Auto-Seed] Notice during seed check:", seedErr);
    }

    // Start Express listener
    const server = app.listen(ENV.PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  STUDIOSPACE API SERVER RUNNING ON PORT ${ENV.PORT}`);
      console.log(`  Environment: ${ENV.NODE_ENV}`);
      console.log(`  Healthcheck: http://localhost:${ENV.PORT}/api/health`);
      console.log(`======================================================\n`);
    });

    // Graceful shutdown
    const handleShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await closeDatabase();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => handleShutdown("SIGINT"));
    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  } catch (error) {
    console.error("[Fatal] Failed to bootstrap server:", error);
    process.exit(1);
  }
}

startServer();
