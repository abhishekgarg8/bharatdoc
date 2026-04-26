import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { User } from "@supabase/supabase-js";
import { AppError } from "@/lib/server/errors";
import type { TokenVerifier, VerifiedUser } from "@/lib/server/auth";
import { getWebEnv } from "@/lib/server/env";
import { createSupabaseServerClient } from "@/lib/server/supabase";

const MAX_TOKEN_CACHE_MS = 60_000;

interface CachedVerifiedUser {
  expiresAt: number;
  user: VerifiedUser;
}

interface SupabaseJwtPayload {
  sub?: unknown;
  email?: unknown;
  phone?: unknown;
  exp?: unknown;
  user_metadata?: {
    email?: unknown;
    phone?: unknown;
  };
}

const tokenCache = new Map<string, CachedVerifiedUser>();

function userContact(user: User): string {
  const metadataEmail = user.user_metadata?.email;

  if (typeof metadataEmail === "string" && metadataEmail.trim()) {
    return metadataEmail.trim();
  }

  return user.email ?? user.id;
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

function readCachedUser(token: string, now = Date.now()): VerifiedUser | null {
  const cached = tokenCache.get(token);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= now) {
    tokenCache.delete(token);
    return null;
  }

  return cached.user;
}

function writeCachedUser(token: string, user: VerifiedUser, payload: SupabaseJwtPayload | null, now = Date.now()) {
  const expiresAt = cacheExpiry(payload, now);

  if (expiresAt > now) {
    tokenCache.set(token, { expiresAt, user });
  }
}

function contactFromPayload(payload: SupabaseJwtPayload, uid: string): string {
  const metadataEmail = payload.user_metadata?.email;
  const metadataPhone = payload.user_metadata?.phone;

  if (typeof metadataEmail === "string" && metadataEmail.trim()) {
    return metadataEmail.trim();
  }

  if (typeof payload.email === "string" && payload.email.trim()) {
    return payload.email.trim();
  }

  if (typeof metadataPhone === "string" && metadataPhone.trim()) {
    return metadataPhone.trim();
  }

  if (typeof payload.phone === "string" && payload.phone.trim()) {
    return payload.phone.trim();
  }

  return uid;
}

function verifyLocalJwt(token: string, secret: string): { payload: SupabaseJwtPayload; user: VerifiedUser } | null {
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

  const uid = parsedPayload.sub.trim();
  return {
    payload: parsedPayload,
    user: {
      uid,
      phoneNumber: contactFromPayload(parsedPayload, uid)
    }
  };
}

export function createSupabaseAuthVerifier(): TokenVerifier {
  return {
    async verifyIdToken(token: string): Promise<VerifiedUser> {
      const cached = readCachedUser(token);

      if (cached) {
        return cached;
      }

      const webEnv = getWebEnv();
      const jwtSecret = webEnv.SUPABASE_JWT_SECRET;

      if (jwtSecret) {
        const local = verifyLocalJwt(token, jwtSecret);

        if (local) {
          writeCachedUser(token, local.user, local.payload);
          return local.user;
        }
      }

      const { data, error } = await createSupabaseServerClient().auth.getUser(token);

      if (error || !data.user) {
        throw new AppError(401, "Supabase token verification failed.", "AUTH_REQUIRED");
      }

      const verifiedUser = {
        uid: data.user.id,
        phoneNumber: userContact(data.user)
      };

      writeCachedUser(token, verifiedUser, parseJwtPayload(token));
      return verifiedUser;
    }
  };
}
