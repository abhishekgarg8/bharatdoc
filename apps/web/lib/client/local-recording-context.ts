"use client";

import type { LocalRecordingScope } from "@/lib/client/local-recordings";

export interface LocalRecordingContext {
  clinicName: string;
  scope: LocalRecordingScope;
}

export interface CachedLocalRecordingContextEntry {
  context: LocalRecordingContext;
  cachedAt: number;
  expiresAt: number;
}

const KEY_PREFIX = "bharatdoc-local-recording-context:";
const CACHE_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_TTL_MS = DEFAULT_TTL_MS;

export function authUserIdFromToken(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const sub = (JSON.parse(atob(base64)) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function cacheLocalRecordingContext(
  context: LocalRecordingContext,
  idToken: string,
  options: { now?: number; ttlMs?: number } = {},
): boolean {
  const localStorage = storage();
  if (
    !localStorage ||
    !localRecordingContextMatchesToken(context, idToken) ||
    !context.scope.authUserId ||
    !context.scope.doctorId
  )
    return false;

  try {
    const cachedAt = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    if (
      !Number.isFinite(cachedAt) ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0 ||
      ttlMs > MAX_TTL_MS
    )
      return false;
    localStorage.setItem(
      `${KEY_PREFIX}${context.scope.authUserId}`,
      JSON.stringify({
        version: CACHE_VERSION,
        context,
        cachedAt,
        expiresAt: cachedAt + ttlMs,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function localRecordingContextMatchesToken(
  context: LocalRecordingContext,
  idToken: string,
): boolean {
  return authUserIdFromToken(idToken) === context.scope.authUserId;
}

export function readCachedLocalRecordingContextEntry(
  idToken: string,
  options: { now?: number } = {},
): CachedLocalRecordingContextEntry | null {
  const authUserId = authUserIdFromToken(idToken);
  const localStorage = storage();
  if (!authUserId || !localStorage) return null;

  const key = `${KEY_PREFIX}${authUserId}`;
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null") as {
      version?: unknown;
      context?: Partial<LocalRecordingContext>;
      cachedAt?: unknown;
      expiresAt?: unknown;
    } | null;
    const scope = parsed?.context?.scope as
      | Partial<LocalRecordingScope>
      | undefined;
    if (
      parsed?.version !== CACHE_VERSION ||
      typeof parsed.context?.clinicName !== "string" ||
      scope?.authUserId !== authUserId ||
      typeof scope.doctorId !== "string" ||
      !(typeof scope.clinicId === "string" || scope.clinicId === null) ||
      typeof parsed.cachedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.cachedAt) ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= parsed.cachedAt ||
      parsed.expiresAt - parsed.cachedAt > MAX_TTL_MS ||
      parsed.expiresAt <= (options.now ?? Date.now())
    ) {
      localStorage.removeItem(key);
      return null;
    }

    return {
      context: {
        clinicName: parsed.context.clinicName,
        scope: scope as LocalRecordingScope,
      },
      cachedAt: parsed.cachedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function readCachedLocalRecordingContext(
  idToken: string,
  options: { now?: number } = {},
): LocalRecordingContext | null {
  return (
    readCachedLocalRecordingContextEntry(idToken, options)?.context ?? null
  );
}

export function clearCachedLocalRecordingContext(idToken: string): void {
  const authUserId = authUserIdFromToken(idToken);
  const localStorage = storage();
  if (authUserId && localStorage)
    localStorage.removeItem(`${KEY_PREFIX}${authUserId}`);
}
