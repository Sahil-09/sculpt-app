import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-32-chars-min";
const ACCESS_TTL = "15m";
const REFRESH_TTL = "30d";

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccess(userId: string): string {
  return jwt.sign({ sub: userId, typ: "access" }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, typ: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyToken(token: string, expectedTyp: "access" | "refresh"): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; typ: string };
    if (decoded.typ !== expectedTyp || !decoded.sub) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

export interface AuthedRequest extends Request {
  userId: string;
}

/** Bearer JWT required; dev fallback only allowed in non-production when explicitly enabled. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const userId = verifyToken(header.slice(7), "access");
    if (!userId) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    (req as AuthedRequest).userId = userId;
    next();
    return;
  }
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_AUTH === "true") {
    const fallback = (req.headers["x-user-id"] as string) ?? "demo-user";
    (req as AuthedRequest).userId = fallback;
    next();
    return;
  }
  res.status(401).json({ error: "Authentication required" });
}

/** Verify a Google ID token via tokeninfo endpoint. Returns { email, sub, name } or null. */
export async function verifyGoogleIdToken(
  idToken: string
): Promise<{ email: string; sub: string; name?: string } | null> {
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!r.ok) return null;
    const data = (await r.json()) as { email?: string; sub?: string; name?: string; aud?: string };
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && data.aud !== clientId) return null;
    if (!data.email || !data.sub) return null;
    return { email: data.email, sub: data.sub, name: data.name };
  } catch {
    return null;
  }
}

let appleKeysCache: { keys: Array<{ kid: string; n: string; e: string; kty: string }> } | null = null;
let appleKeysExpires = 0;

/** Verify Apple identity token signature and claims. */
export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<{ email?: string; sub?: string } | null> {
  try {
    const parts = identityToken.split(".");
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { kid?: string; alg?: string };
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      email?: string;
      sub?: string;
      exp?: number;
      iss?: string;
      aud?: string;
    };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    if (!payload.sub) return null;
    if (payload.iss && payload.iss !== "https://appleid.apple.com") return null;
    const appleClientId = process.env.APPLE_CLIENT_ID;
    if (appleClientId && payload.aud !== appleClientId) return null;

    if (process.env.NODE_ENV === "production" || appleClientId) {
      if (!header.kid) return null;
      if (!appleKeysCache || Date.now() > appleKeysExpires) {
        const res = await fetch("https://appleid.apple.com/auth/keys");
        if (!res.ok) return null;
        appleKeysCache = (await res.json()) as { keys: Array<{ kid: string; n: string; e: string; kty: string }> };
        appleKeysExpires = Date.now() + 3600_000;
      }
      const jwk = appleKeysCache.keys.find((k) => k.kid === header.kid);
      if (!jwk) return null;
      const { createPublicKey, verify } = await import("crypto");
      const keyObj = createPublicKey({ key: jwk as unknown as import("crypto").JsonWebKey, format: "jwk" });
      const signedData = Buffer.from(`${parts[0]}.${parts[1]}`);
      const signature = Buffer.from(parts[2], "base64url");
      const isValid = verify("SHA256", signedData, keyObj, signature);
      if (!isValid) return null;
    }
    return { email: payload.email, sub: payload.sub };
  } catch {
    return null;
  }
}

/** Backward-compatible alias for verifyAppleIdentityToken. */
export const decodeAppleIdentityToken = verifyAppleIdentityToken;
