import { Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import { getDatabase } from "../config/db.js";
import { getAuth, signUserJWT, AuthenticatedUser } from "../config/auth.js";
import { ENV } from "../config/env.js";

// Custom password hasher matching standard sha256/scrypt or crypto
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, key] = stored.split(":");
    if (!salt || !key) return false;
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
    return hash === key;
  } catch {
    return false;
  }
}

const RegisterSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  photoUrl: z.string().url("Valid photo URL is required").or(z.literal("")).optional(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const validated = RegisterSchema.parse(req.body);
      const db = getDatabase();
      const userCollection = db.collection("user");
      const accountCollection = db.collection("account");

      const existingUser = await userCollection.findOne({
        email: validated.email.toLowerCase(),
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "An account with this email address already exists. Please log in.",
        });
      }

      const imageUrl =
        validated.photoUrl && validated.photoUrl.trim() !== ""
          ? validated.photoUrl
          : `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80`;

      // 1. Primary: Use Better Auth native signUpEmail API
      const auth = getAuth();
      let createdUser: any = null;
      try {
        const baResult = await auth.api.signUpEmail({
          body: {
            name: validated.name,
            email: validated.email.toLowerCase(),
            password: validated.password,
            image: imageUrl,
          },
        });
        if (baResult && baResult.user) {
          createdUser = baResult.user;
        }
      } catch (baErr: any) {
        if (baErr.message?.includes("already exists") || baErr.status === 400 || baErr.code === "USER_ALREADY_EXISTS") {
          return res.status(400).json({
            success: false,
            message: "An account with this email address already exists. Please log in.",
          });
        }
        console.warn("[AuthController.register] Better Auth engine notice, activating direct adapter:", baErr.message);
      }

      if (createdUser) {
        return res.status(201).json({
          success: true,
          message: "Registration successful. Please log in with your credentials.",
          data: {
            id: createdUser.id,
            name: createdUser.name,
            email: createdUser.email,
            image: createdUser.image,
          },
        });
      }

      const userId = crypto.randomUUID();
      const newUserDoc = {
        id: userId,
        name: validated.name,
        email: validated.email.toLowerCase(),
        emailVerified: false,
        image: imageUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await userCollection.insertOne(newUserDoc as any);

      // Store credentials in account collection compatible with Better Auth
      const hashedPassword = hashPassword(validated.password);
      await accountCollection.insertOne({
        id: crypto.randomUUID(),
        userId: userId,
        accountId: userId,
        providerId: "credential",
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return res.status(201).json({
        success: true,
        message: "Registration successful. Please log in with your credentials.",
        data: {
          id: userId,
          name: validated.name,
          email: validated.email.toLowerCase(),
          image: imageUrl,
        },
      });
    } catch (error: any) {
      console.error("[AuthController.register] Error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Registration failed",
        errors: error.errors || undefined,
      });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const validated = LoginSchema.parse(req.body);
      const db = getDatabase();
      const userCollection = db.collection("user");
      const accountCollection = db.collection("account");

      let authenticatedUser: AuthenticatedUser | null = null;

      // 1. Primary Authentication: Better Auth native signInEmail
      try {
        const auth = getAuth();
        const baResult = await auth.api.signInEmail({
          body: {
            email: validated.email.toLowerCase(),
            password: validated.password,
          },
        });

        if (baResult && baResult.user) {
          authenticatedUser = {
            id: baResult.user.id || (baResult.user as any)._id?.toString(),
            email: baResult.user.email,
            name: baResult.user.name,
            image: baResult.user.image,
          };
        }
      } catch (baErr: any) {
        // Better Auth check returned error, proceed to check pre-seeded accounts
      }

      // 2. Compatibility fallback: check database account collection for pre-seeded or migrated accounts
      if (!authenticatedUser) {
        const user = await userCollection.findOne({
          email: validated.email.toLowerCase(),
        });

        if (user) {
          const account = await accountCollection.findOne({
            userId: user.id || user._id.toString(),
            providerId: "credential",
          });

          if (account && account.password && verifyPassword(validated.password, account.password)) {
            authenticatedUser = {
              id: user.id || user._id.toString(),
              email: user.email,
              name: user.name,
              image: user.image,
            };
          }
        }
      }

      if (!authenticatedUser) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      // Generate JWT
      const token = signUserJWT(authenticatedUser);

      // Set HTTPOnly cookie
      res.cookie("shoot_jwt_token", token, {
        httpOnly: true,
        secure: ENV.IS_PRODUCTION,
        sameSite: ENV.IS_PRODUCTION ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        user: authenticatedUser,
        token, // Also returned for client auth state if desired
      });
    } catch (error: any) {
      console.error("[AuthController.login] Error:", error);
      return res.status(400).json({
        success: false,
        message: error.message || "Login failed",
      });
    }
  }

  static async logout(req: Request, res: Response) {
    try {
      res.clearCookie("shoot_jwt_token", {
        httpOnly: true,
        secure: ENV.IS_PRODUCTION,
        sameSite: ENV.IS_PRODUCTION ? "none" : "lax",
        path: "/",
      });

      res.clearCookie("better-auth.session_token", {
        path: "/",
      });

      return res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error: any) {
      console.error("[AuthController.logout] Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to log out cleanly",
      });
    }
  }

  static async me(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    return res.status(200).json({
      success: true,
      user: req.user,
    });
  }

  static async syncSocial(req: Request, res: Response) {
    try {
      const { user } = req.body;
      if (!user || !user.email) {
        return res.status(400).json({ success: false, message: "User information required" });
      }

      const authenticatedUser: AuthenticatedUser = {
        id: user.id || user._id || crypto.randomUUID(),
        email: user.email,
        name: user.name || user.email.split("@")[0],
        image: user.image || undefined,
      };

      const token = signUserJWT(authenticatedUser);

      res.cookie("shoot_jwt_token", token, {
        httpOnly: true,
        secure: ENV.IS_PRODUCTION,
        sameSite: ENV.IS_PRODUCTION ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return res.status(200).json({
        success: true,
        user: authenticatedUser,
        token,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: "Failed to synchronize social auth" });
    }
  }
}
