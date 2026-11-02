import { Request, Response, NextFunction } from "express";
import { verifyUserJWT, getAuth, AuthenticatedUser } from "../config/auth.js";
import { ENV } from "../config/env.js";
import { getDatabase } from "../config/db.js";
import { ObjectId } from "mongodb";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Check HTTPOnly cookie shoot_jwt_token
    const jwtCookie = req.cookies?.shoot_jwt_token;
    if (jwtCookie) {
      const decoded = verifyUserJWT(jwtCookie);
      if (decoded && decoded.id && decoded.email) {
        req.user = decoded;
        return next();
      }
    }

    // 2. Check Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7).trim();
      const decoded = verifyUserJWT(token);
      if (decoded && decoded.id && decoded.email) {
        req.user = decoded;
        return next();
      }
    }

    // 3. Check Better Auth session via getSession or session cookie
    try {
      const auth = getAuth();
      const session = await auth.api.getSession({
        headers: req.headers as any,
      });

      if (session && session.user) {
        req.user = {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          image: session.user.image || undefined,
        };
        return next();
      }
    } catch (baErr) {
      // Better Auth session lookup error or no session
    }

    // 4. Check better-auth session cookie directly in MongoDB if needed
    const sessionToken = req.cookies?.["better-auth.session_token"] || req.cookies?.["better_auth_session_token"];
    if (sessionToken) {
      try {
        const db = getDatabase();
        const sessionRecord = await db.collection("session").findOne({
          token: sessionToken,
          expiresAt: { $gt: new Date() },
        });

        if (sessionRecord && sessionRecord.userId) {
          const userRecord = await db.collection("user").findOne({
            $or: [
              { _id: new ObjectId(sessionRecord.userId) },
              { id: sessionRecord.userId },
              { _id: sessionRecord.userId }
            ]
          });

          if (userRecord) {
            req.user = {
              id: userRecord.id || userRecord._id.toString(),
              email: userRecord.email,
              name: userRecord.name,
              image: userRecord.image,
            };
            return next();
          }
        }
      } catch (err) {
        // Continue to 401
      }
    }

    // Unauthorized
    res.status(401).json({
      success: false,
      message: "Unauthorized: Access denied. Please log in to continue.",
    });
  } catch (error) {
    console.error("[requireAuth] Error verifying authentication:", error);
    res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired authentication session.",
    });
  }
}
