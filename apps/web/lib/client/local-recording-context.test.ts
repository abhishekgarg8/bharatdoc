import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheLocalRecordingContext,
  readCachedLocalRecordingContext,
  readCachedLocalRecordingContextEntry,
} from "@/lib/client/local-recording-context";

function tokenFor(sub: string): string {
  return `header.${btoa(JSON.stringify({ sub })).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")}.signature`;
}

const context = {
  clinicName: "Sunrise Hospital",
  scope: {
    authUserId: "auth-user-1",
    doctorId: "doctor-1",
    clinicId: "clinic-1",
  },
};

describe("local recording context cache", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores last-verified scope only for the current token UID", () => {
    cacheLocalRecordingContext(context, tokenFor("auth-user-1"));

    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toEqual(
      context,
    );
    expect(readCachedLocalRecordingContext(tokenFor("auth-user-2"))).toBeNull();
    expect(readCachedLocalRecordingContext("not-a-jwt")).toBeNull();
  });

  it("refuses to cache a dashboard scope for a different token UID", () => {
    expect(cacheLocalRecordingContext(context, tokenFor("auth-user-2"))).toBe(
      false,
    );
    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toBeNull();
  });

  it("rejects tampered or partial cached scope", () => {
    window.localStorage.setItem(
      "bharatdoc-local-recording-context:auth-user-1",
      JSON.stringify({
        clinicName: "Wrong",
        scope: { authUserId: "auth-user-2", doctorId: "doctor-2" },
      }),
    );

    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toBeNull();
  });

  it("expires and removes stale authorization scope", () => {
    cacheLocalRecordingContext(context, tokenFor("auth-user-1"), {
      now: 1_000,
      ttlMs: 500,
    });

    expect(
      readCachedLocalRecordingContextEntry(tokenFor("auth-user-1"), {
        now: 1_499,
      }),
    ).toMatchObject({
      context,
      cachedAt: 1_000,
      expiresAt: 1_500,
    });
    expect(
      readCachedLocalRecordingContext(tokenFor("auth-user-1"), { now: 1_500 }),
    ).toBeNull();
    expect(window.localStorage).toHaveLength(0);
  });

  it("removes corrupt and legacy unversioned entries", () => {
    window.localStorage.setItem(
      "bharatdoc-local-recording-context:auth-user-1",
      JSON.stringify(context),
    );

    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toBeNull();
    expect(window.localStorage).toHaveLength(0);
  });

  it("refuses cache lifetimes beyond the authorization policy", () => {
    expect(
      cacheLocalRecordingContext(context, tokenFor("auth-user-1"), {
        ttlMs: 0,
      }),
    ).toBe(false);
    expect(
      cacheLocalRecordingContext(context, tokenFor("auth-user-1"), {
        ttlMs: 24 * 60 * 60 * 1_000 + 1,
      }),
    ).toBe(false);
    expect(window.localStorage).toHaveLength(0);
  });
});
