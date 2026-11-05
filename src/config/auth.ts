import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { jwt } from "better-auth/plugins/jwt";
import { Db } from "mongodb";
import jwtSimple from "jsonwebtoken";
import { ENV } from "./env.js";

let authInstance: any = null;

export function initAuth(db: any) {
  // In the Vercel-domain OAuth callback architecture:
  // Browser-facing callback is https://thestudiospace.vercel.app/api/auth/callback/google,
  // which Vercel proxies internally to Render.
  // Better Auth baseURL must be configured to the Vercel frontend domain (https://thestudiospace.vercel.app)
  // so that Google OAuth redirect_uri is generated as https://thestudiospace.vercel.app/api/auth/callback/google,
  // completely eliminating onrender.com from the browser address bar and bypassing Chrome Safe Browsing false-positives.
  const authBaseURL = (
    process.env.BETTER_AUTH_BASE_URL ||
    (ENV.IS_PRODUCTION ? (process.env.FRONTEND_URL || "https://thestudiospace.vercel.app") : ENV.BETTER_AUTH_URL)
  ).trim().replace(/\/$/, "");

  const isSecure = ENV.IS_PRODUCTION || authBaseURL.startsWith("https://");

  authInstance = betterAuth({
    database: mongodbAdapter(db),
    secret: ENV.BETTER_AUTH_SECRET,
    baseURL: authBaseURL,
    onAPIError: {
      errorURL: `${authBaseURL}/login`,
    },
    trustedOrigins: [
      ENV.FRONTEND_URL,
      "https://thestudiospace.vercel.app",
      "https://studiospace.vercel.app",
      "https://studiospace-api-4vhn.onrender.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      "https://studiospacehq.vercel.app",
      "https://studiospacecreative.vercel.app",
      "https://mystudiospace.vercel.app",
    ].filter(Boolean),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
    },
    socialProviders: {
      google: {
        clientId: (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim() !== "")
          ? process.env.GOOGLE_CLIENT_ID
          : (ENV.GOOGLE_CLIENT_ID && ENV.GOOGLE_CLIENT_ID.trim() !== "")
            ? ENV.GOOGLE_CLIENT_ID
            : "placeholder-client-id",
        clientSecret: (process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CLIENT_SECRET.trim() !== "")
          ? process.env.GOOGLE_CLIENT_SECRET
          : (ENV.GOOGLE_CLIENT_SECRET && ENV.GOOGLE_CLIENT_SECRET.trim() !== "")
            ? ENV.GOOGLE_CLIENT_SECRET
            : "placeholder-client-secret",
      },
    },
    account: {
      storeStateStrategy: "database",
      skipStateCookieCheck: true,
    },
    advanced: {
      useSecureCookies: isSecure,
      defaultCookieAttributes: {
        sameSite: isSecure ? "none" : "lax",
        secure: isSecure,
        httpOnly: true,
      },
      cookies: {
        state: {
          attributes: {
            sameSite: isSecure ? "none" : "lax",
            secure: isSecure,
          },
        },
        oauth_state: {
          attributes: {
            sameSite: isSecure ? "none" : "lax",
            secure: isSecure,
          },
        },
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

export function getAuthSafe() {
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
