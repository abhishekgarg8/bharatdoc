import { createHash } from "node:crypto";
import { AppError } from "@/lib/server/errors";

const BURST_WINDOW_MS = 60_000;
const BURST_LIMIT = 30;
const INVALID_WINDOW_MS = 10 * 60_000;
const INVALID_LIMIT = 5;

interface Bucket {
  count: number;
  resetAt: number;
}

type RateLimitStore = Map<string, Bucket>;

const globalRateLimitStore = globalThis as typeof globalThis & {
  __bharatDocClinicLookupRateLimit?: RateLimitStore;
};

function store(): RateLimitStore {
  globalRateLimitStore.__bharatDocClinicLookupRateLimit ??= new Map<string, Bucket>();
  return globalRateLimitStore.__bharatDocClinicLookupRateLimit;
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export function clinicLookupClientKey(request: Request): string {
  const ip =
    firstHeaderValue(request.headers.get("x-forwarded-for")) ??
    firstHeaderValue(request.headers.get("x-real-ip")) ??
    "unknown-ip";
  const userAgent = request.headers.get("user-agent")?.slice(0, 120) ?? "unknown-agent";

  return hashKey(`${ip}|${userAgent}`);
}

function bucketKey(scope: string, clientKey: string): string {
  return `${scope}:${clientKey}`;
}

function readBucket(key: string, windowMs: number, now: number): Bucket {
  const current = store().get(key);

  if (!current || current.resetAt <= now) {
    return {
      count: 0,
      resetAt: now + windowMs
    };
  }

  return current;
}

function hit(key: string, windowMs: number, now: number): Bucket {
  const bucket = readBucket(key, windowMs, now);
  bucket.count += 1;
  store().set(key, bucket);
  return bucket;
}

function retryAfterSeconds(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}

export function assertClinicLookupAllowed(request: Request, now = Date.now()): void {
  const clientKey = clinicLookupClientKey(request);
  const burstBucket = hit(bucketKey("clinic_lookup_burst", clientKey), BURST_WINDOW_MS, now);

  if (burstBucket.count > BURST_LIMIT) {
    throw new AppError(
      429,
      `Too many hospital lookup attempts. Try again in ${retryAfterSeconds(burstBucket.resetAt, now)} seconds.`,
      "RATE_LIMITED"
    );
  }

  const invalidBucket = readBucket(bucketKey("clinic_lookup_invalid", clientKey), INVALID_WINDOW_MS, now);

  if (invalidBucket.count >= INVALID_LIMIT) {
    throw new AppError(
      429,
      `Too many failed hospital code lookup attempts. Try again in ${retryAfterSeconds(invalidBucket.resetAt, now)} seconds.`,
      "RATE_LIMITED"
    );
  }
}

export function recordClinicLookupMiss(request: Request, now = Date.now()): void {
  const clientKey = clinicLookupClientKey(request);
  const invalidBucket = hit(bucketKey("clinic_lookup_invalid", clientKey), INVALID_WINDOW_MS, now);

  console.warn("clinic_lookup.miss", {
    client_key: clientKey,
    attempts: invalidBucket.count,
    reset_at: new Date(invalidBucket.resetAt).toISOString()
  });
}

export function resetClinicLookupRateLimitForTests(): void {
  store().clear();
}
