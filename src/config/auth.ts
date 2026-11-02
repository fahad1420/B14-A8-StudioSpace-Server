import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins/jwt";
import { Db } from "mongodb";
import jwtSimple from "jsonwebtoken";
import { ENV } from "./env.js";

let authInstance: any = null;

export function initAuth(db: any) {
  authInstance = betterAuth({
    database: mongodbAdapter(db),
    secret: ENV.BETTER_AUTH_SECRET,
    baseURL: ENV.BETTER_AUTH_URL,
    trustedOrigins: [ENV.FRONTEND_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "placeholder-client-id",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "placeholder-client-secret",
        enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      },
    },
    plugins: [
      jwt(),
    ],
  });

  return authInstance;
}

export function getAuth() {
  if (!authInstance) {
    throw new Error("Better Auth not initialized. Call initAuth() with database instance first.");
  }
  return authInstance;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export function signUserJWT(user: AuthenticatedUser): string {
  return jwtSimple.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    ENV.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyUserJWT(token: string): AuthenticatedUser | null {
  try {
    const decoded = jwtSimple.verify(token, ENV.JWT_SECRET) as AuthenticatedUser;
    return decoded;
  } catch (error) {
    return null;
  }
}
