"use client";

import type { LocalRecordingScope } from "@/lib/client/local-recordings";

export interface LocalRecordingContext {
  clinicName: string;
  scope: LocalRecordingScope;
}

const KEY_PREFIX = "bharatdoc-local-recording-context:";

function tokenUserId(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
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

export function cacheLocalRecordingContext(context: LocalRecordingContext, idToken: string): boolean {
  const localStorage = storage();
  if (
    !localStorage ||
    !localRecordingContextMatchesToken(context, idToken) ||
    !context.scope.authUserId ||
    !context.scope.doctorId
  ) return false;

  try {
    localStorage.setItem(`${KEY_PREFIX}${context.scope.authUserId}`, JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

export function localRecordingContextMatchesToken(context: LocalRecordingContext, idToken: string): boolean {
  return tokenUserId(idToken) === context.scope.authUserId;
}

export function readCachedLocalRecordingContext(idToken: string): LocalRecordingContext | null {
  const authUserId = tokenUserId(idToken);
  const localStorage = storage();
  if (!authUserId || !localStorage) return null;

  try {
    const parsed = JSON.parse(localStorage.getItem(`${KEY_PREFIX}${authUserId}`) ?? "null") as Partial<LocalRecordingContext> | null;
    const scope = parsed?.scope as Partial<LocalRecordingScope> | undefined;
    if (
      typeof parsed?.clinicName !== "string" ||
      scope?.authUserId !== authUserId ||
      typeof scope.doctorId !== "string" ||
      !(typeof scope.clinicId === "string" || scope.clinicId === null)
    ) return null;

    return { clinicName: parsed.clinicName, scope: scope as LocalRecordingScope };
  } catch {
    return null;
  }
}
