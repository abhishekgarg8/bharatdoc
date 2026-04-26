import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "./http-errors.js";
import type { AuthTokenVerifier, VerifiedAuthToken } from "./types.js";
import { workerEnv } from "./env.js";

const MAX_TOKEN_CACHE_MS = 60_000;

interface CachedVerifiedToken {
  expiresAt: number;
  token: VerifiedAuthToken;
}

interface SupabaseJwtPayload {
  sub?: unknown;
  email?: unknown;
  exp?: unknown;
  user_metadata?: {
    email?: unknown;
  };
}

const tokenCache = new Map<string, CachedVerifiedToken>();

function verifiedTokenFromUser(user: User): VerifiedAuthToken {
  return {
    uid: user.id,
    ...(user.email ? { email: user.email } : {})
  };
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function parseJwtPayload(token: string): SupabaseJwtPayload | null {
  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(decodeBase64Url(payload).toString("utf8")) as SupabaseJwtPayload;
  } catch {
    return null;
  }
}

function cacheExpiry(payload: SupabaseJwtPayload | null, now: number): number {
  const tokenExpiryMs = typeof payload?.exp === "number" ? payload.exp * 1000 : now + MAX_TOKEN_CACHE_MS;
  return Math.min(tokenExpiryMs, now + MAX_TOKEN_CACHE_MS);
}

function readCachedToken(token: string, now = Date.now()): VerifiedAuthToken | null {
  const cached = tokenCache.get(token);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    tokenCache.delete(token);
    return null;
  }

  return cached.token;
}

function writeCachedToken(token: string, verifiedToken: VerifiedAuthToken, payload: SupabaseJwtPayload | null, now = Date.now()) {
  const expiresAt = cacheExpiry(payload, now);

  if (expiresAt > now) {
    tokenCache.set(token, { expiresAt, token: verifiedToken });
  }
}

function verifyLocalJwt(token: string, secret: string): { payload: SupabaseJwtPayload; token: VerifiedAuthToken } | null {
  const [header, payload, signature] = token.split(".");

  if (!header || !payload || !signature) {
    return null;
  }

  const headerPayload = `${header}.${payload}`;
  const expected = createHmac("sha256", secret).update(headerPayload).digest();
  const actual = decodeBase64Url(signature);

  if (expected.byteLength !== actual.byteLength || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const parsedPayload = parseJwtPayload(token);

  if (!parsedPayload || typeof parsedPayload.sub !== "string" || !parsedPayload.sub.trim()) {
    return null;
  }

  if (typeof parsedPayload.exp === "number" && parsedPayload.exp * 1000 <= Date.now()) {
    return null;
  }

  const verifiedToken: VerifiedAuthToken = {
    uid: parsedPayload.sub.trim()
  };
  const metadataEmail = parsedPayload.user_metadata?.email;

  if (typeof metadataEmail === "string" && metadataEmail.trim()) {
    verifiedToken.email = metadataEmail.trim();
  } else if (typeof parsedPayload.email === "string" && parsedPayload.email.trim()) {
    verifiedToken.email = parsedPayload.email.trim();
  }

  return { payload: parsedPayload, token: verifiedToken };
}

export function createSupabaseTokenVerifier(supabase: SupabaseClient): AuthTokenVerifier {
  return {
    async verifyIdToken(token: string): Promise<VerifiedAuthToken> {
      const cached = readCachedToken(token);

      if (cached) {
        return cached;
      }

      if (workerEnv.SUPABASE_JWT_SECRET) {
        const local = verifyLocalJwt(token, workerEnv.SUPABASE_JWT_SECRET);

        if (local) {
          writeCachedToken(token, local.token, local.payload);
          return local.token;
        }
      }

      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        throw new HttpError(401, "Supabase token verification failed.", "AUTH_REQUIRED");
      }

      const verifiedToken = verifiedTokenFromUser(data.user);
      writeCachedToken(token, verifiedToken, parseJwtPayload(token));
      return verifiedToken;
    }
  };
}
