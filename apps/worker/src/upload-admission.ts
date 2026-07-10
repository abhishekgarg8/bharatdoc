import { isIP } from "node:net";
import type { Request, RequestHandler, Response } from "express";
import { HttpError } from "./http-errors.js";
import type { AuthContext } from "./types.js";
import { MAX_TRANSCRIPTION_UPLOAD_BYTES } from "./transcription.js";

export interface UploadAdmissionLimits {
  maxConcurrent: number;
  maxPerIp: number;
  maxPerUser: number;
  windowMs: number;
}

export const DEFAULT_UPLOAD_ADMISSION: UploadAdmissionLimits = {
  maxConcurrent: 1,
  maxPerIp: 30,
  maxPerUser: 6,
  windowMs: 60_000,
};

const MAX_TRACKED_KEYS = 10_000;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
export const MAX_TRANSCRIPTION_REQUEST_BYTES =
  MAX_TRANSCRIPTION_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;

interface RateBucket {
  count: number;
  resetAt: number;
}

interface UploadPermit {
  inHandler: boolean;
  release(): void;
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function clientIp(req: Request): string {
  // Railway's public edge supplies one validated address; never trust X-Forwarded-For here.
  const railwayIp = req.header("x-real-ip")?.trim();

  if (railwayIp && isIP(railwayIp)) {
    return railwayIp;
  }

  return req.socket.remoteAddress ?? "unknown";
}

function consume(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): RateBucket | null {
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      for (const [candidate, value] of buckets) {
        if (value.resetAt <= now) buckets.delete(candidate);
      }
      if (buckets.size >= MAX_TRACKED_KEYS) {
        buckets.delete(buckets.keys().next().value as string);
      }
    }
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= limit) return bucket;
  bucket.count += 1;
  return null;
}

function rateLimit(
  res: Parameters<RequestHandler>[1],
  bucket: RateBucket,
  now: number,
  code: string,
): HttpError {
  res.setHeader(
    "Retry-After",
    Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  );
  return new HttpError(
    429,
    "Too many transcription uploads. Try again later.",
    code,
  );
}

export function createUploadAdmission(
  configured: Partial<UploadAdmissionLimits> = {},
): { limitIp: RequestHandler; admitAuthenticated: RequestHandler } {
  const limits = {
    maxConcurrent: positiveInteger(
      configured.maxConcurrent ?? 0,
      DEFAULT_UPLOAD_ADMISSION.maxConcurrent,
    ),
    maxPerIp: positiveInteger(
      configured.maxPerIp ?? 0,
      DEFAULT_UPLOAD_ADMISSION.maxPerIp,
    ),
    maxPerUser: positiveInteger(
      configured.maxPerUser ?? 0,
      DEFAULT_UPLOAD_ADMISSION.maxPerUser,
    ),
    windowMs: positiveInteger(
      configured.windowMs ?? 0,
      DEFAULT_UPLOAD_ADMISSION.windowMs,
    ),
  };
  const ipBuckets = new Map<string, RateBucket>();
  const userBuckets = new Map<string, RateBucket>();
  let active = 0;

  return {
    limitIp(req, res, next) {
      const now = Date.now();
      const exceeded = consume(
        ipBuckets,
        clientIp(req),
        limits.maxPerIp,
        limits.windowMs,
        now,
      );
      next(
        exceeded
          ? rateLimit(res, exceeded, now, "UPLOAD_IP_RATE_LIMITED")
          : undefined,
      );
    },
    admitAuthenticated(req, res, next) {
      const now = Date.now();
      const auth = res.locals.auth as AuthContext;
      const exceeded = consume(
        userBuckets,
        auth.doctor.id,
        limits.maxPerUser,
        limits.windowMs,
        now,
      );

      if (exceeded) {
        next(rateLimit(res, exceeded, now, "UPLOAD_USER_RATE_LIMITED"));
        return;
      }

      const contentLength = req.header("content-length");
      if (
        contentLength &&
        Number(contentLength) > MAX_TRANSCRIPTION_REQUEST_BYTES
      ) {
        next(
          new HttpError(
            413,
            "Audio file exceeds the worker upload size limit.",
            "AUDIO_TOO_LARGE",
          ),
        );
        return;
      }

      if (active >= limits.maxConcurrent) {
        res.setHeader("Retry-After", "1");
        next(
          new HttpError(
            429,
            "The upload worker is busy. Try again shortly.",
            "UPLOAD_CONCURRENCY_LIMITED",
          ),
        );
        return;
      }

      active += 1;
      let released = false;
      const permit: UploadPermit = {
        inHandler: false,
        release() {
          if (!released) {
            released = true;
            active -= 1;
          }
        },
      };
      res.locals.uploadPermit = permit;
      res.once("finish", permit.release);
      res.once("close", () => {
        if (!permit.inHandler) permit.release();
      });
      req.once("aborted", () => {
        if (!permit.inHandler) permit.release();
      });

      try {
        next();
      } catch (error) {
        permit.release();
        throw error;
      }
    },
  };
}

export function holdUploadPermitForHandler(res: Response): () => void {
  const permit = res.locals.uploadPermit as UploadPermit | undefined;
  if (!permit) return () => undefined;
  permit.inHandler = true;
  return permit.release;
}
