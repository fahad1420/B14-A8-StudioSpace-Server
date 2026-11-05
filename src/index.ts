import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";
import { connectToDatabase, closeDatabase, isDatabaseConnected } from "./config/db.js";
import { initAuth, getAuthSafe } from "./config/auth.js";
import { ENV } from "./config/env.js";
import { seedDatabase } from "./seed.js";

import studioRoutes from "./routes/studio.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import authRoutes from "./routes/auth.routes.js";
import miscRoutes from "./routes/misc.routes.js";

const app = express();

// Trust reverse proxy (Cloudflare / Render) for secure cookies and accurate protocol/host detection
app.set("trust proxy", 1);

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

// 1. Healthcheck (Always returns HTTP 200 immediately for cloud health checks)
app.get("/api/health", (_req, res) => {
  const dbConnected = isDatabaseConnected();
  res.status(200).json({
    status: "ok",
    database: dbConnected ? "connected" : "connecting",
    brand: "STUDIOSPACE",
    tagline: "Find Your Space. Create Your Story.",
    environment: ENV.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// 2. Root info
app.get("/", (_req, res) => {
  res.status(200).json({
    name: "B14-A8 | StudioSpace Server",
    version: "1.0.0",
    brand: "STUDIOSPACE",
    tagline: "Find Your Space. Create Your Story.",
    docs: "/api/health",
  });
});

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
  const auth = getAuthSafe();
  if (!auth) {
    return res.status(503).json({
      success: false,
      message: "Authentication service initializing. Please retry in a few moments.",
      database: isDatabaseConnected() ? "connected" : "connecting",
    });
  }
  return toNodeHandler(auth as any)(req, res);
});

// 4. Database readiness guard for data API routes
app.use("/api", (req, res, next) => {
  if (req.path === "/health" || req.method === "OPTIONS") {
    return next();
  }
  if (!isDatabaseConnected()) {
    initiateDatabaseConnection().catch(() => {});
    return res.status(503).json({
      success: false,
      message: "Database service initializing. Please retry in a few moments.",
      database: "connecting",
    });
  }
  next();
});

// 5. Mount API Routes
app.use("/api/auth", authRoutes);
app.use("/api/studios", studioRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api", miscRoutes);

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

// Asynchronous Database Connection & Background Initializer
let isConnecting = false;
async function initiateDatabaseConnection(maxInitialAttempts = 15, initialDelayMs = 2000) {
  if (isConnecting || isDatabaseConnected()) return;
  isConnecting = true;
  let attempt = 0;
  let delay = initialDelayMs;

  while (!isDatabaseConnected()) {
    attempt++;
    try {
      console.log(`[Database] Connecting to database (Attempt ${attempt})...`);
      const db = await connectToDatabase();
      initAuth(db);

      // Auto-seed if database is empty
      try {
        await seedDatabase();
      } catch (seedErr) {
        console.warn("[Auto-Seed] Notice during seed check:", seedErr);
      }

      console.log(`[Database] Successfully established database connection and initialized auth.`);
      isConnecting = false;
      return;
    } catch (err: any) {
      console.error(`[Database] Attempt ${attempt} failed:`, err.message || err);
      console.log(`[Database] Retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(Math.round(delay * 1.5), 15000); // capped at 15s
    }
  }

  isConnecting = false;
}

// Start Express listener IMMEDIATELY so Render port scanner & health check pass
const server = app.listen(ENV.PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  STUDIOSPACE API SERVER RUNNING ON PORT ${ENV.PORT}`);
  console.log(`  Environment: ${ENV.NODE_ENV}`);
  console.log(`  Healthcheck: http://localhost:${ENV.PORT}/api/health`);
  console.log(`======================================================\n`);

  // Initiate database connection asynchronously in background
  initiateDatabaseConnection().catch((err) => {
    console.error("[Database] Background connection orchestrator unhandled error:", err);
  });
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
