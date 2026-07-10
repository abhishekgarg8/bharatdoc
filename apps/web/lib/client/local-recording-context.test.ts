import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheLocalRecordingContext,
  readCachedLocalRecordingContext
} from "@/lib/client/local-recording-context";

function tokenFor(sub: string): string {
  return `header.${btoa(JSON.stringify({ sub })).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")}.signature`;
}

const context = {
  clinicName: "Sunrise Hospital",
  scope: { authUserId: "auth-user-1", doctorId: "doctor-1", clinicId: "clinic-1" }
};

describe("local recording context cache", () => {
  beforeEach(() => window.localStorage.clear());

  it("restores last-verified scope only for the current token UID", () => {
    cacheLocalRecordingContext(context, tokenFor("auth-user-1"));

    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toEqual(context);
    expect(readCachedLocalRecordingContext(tokenFor("auth-user-2"))).toBeNull();
    expect(readCachedLocalRecordingContext("not-a-jwt")).toBeNull();
  });

  it("refuses to cache a dashboard scope for a different token UID", () => {
    expect(cacheLocalRecordingContext(context, tokenFor("auth-user-2"))).toBe(false);
    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toBeNull();
  });

  it("rejects tampered or partial cached scope", () => {
    window.localStorage.setItem(
      "bharatdoc-local-recording-context:auth-user-1",
      JSON.stringify({ clinicName: "Wrong", scope: { authUserId: "auth-user-2", doctorId: "doctor-2" } })
    );

    expect(readCachedLocalRecordingContext(tokenFor("auth-user-1"))).toBeNull();
  });
});
