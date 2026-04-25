import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertClinicLookupAllowed,
  clinicLookupClientKey,
  recordClinicLookupMiss,
  resetClinicLookupRateLimitForTests
} from "@/lib/server/clinic-lookup-guard";

function lookupRequest(ip = "203.0.113.10"): Request {
  return new Request("https://bharatdoc.example/api/clinics/lookup?code=BAD", {
    headers: {
      "x-forwarded-for": ip,
      "user-agent": "vitest"
    }
  });
}

afterEach(() => {
  resetClinicLookupRateLimitForTests();
  vi.restoreAllMocks();
});

describe("clinic lookup abuse guard", () => {
  it("uses a stable hashed client key instead of raw IP addresses", () => {
    const request = lookupRequest();
    const key = clinicLookupClientKey(request);

    expect(key).toHaveLength(32);
    expect(key).not.toContain("203.0.113.10");
  });

  it("throttles repeated invalid clinic-code lookups", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = lookupRequest();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      assertClinicLookupAllowed(request, 1_000);
      recordClinicLookupMiss(request, 1_000);
    }

    expect(() => assertClinicLookupAllowed(request, 1_000)).toThrow("Too many failed hospital code lookup attempts.");
    expect(console.warn).toHaveBeenCalledWith(
      "clinic_lookup.miss",
      expect.objectContaining({
        attempts: 5
      })
    );
  });

  it("resets invalid lookup throttles after the window expires", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const request = lookupRequest();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordClinicLookupMiss(request, 1_000);
    }

    expect(() => assertClinicLookupAllowed(request, 1_000 + 10 * 60_000 + 1)).not.toThrow();
  });
});
