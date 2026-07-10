import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSearchNavigationState,
  readSearchNavigationState,
  saveSearchNavigationState,
  scrubCurrentNavigationUrl,
  type SearchNavigationScope,
} from "@/lib/client/search-navigation-state";

const scope: SearchNavigationScope = {
  authUserId: "auth-a",
  doctorId: "doctor-a",
  clinicId: "clinic-a",
};
const record = {
  id: "recording-a",
  patientId: "P-SENSITIVE-10482",
  time: "Today, 10:00",
  duration: "1:00",
  doctorName: "Dr. A",
  status: "recorded" as const,
};

describe("PHI-safe search navigation state", () => {
  beforeEach(() => {
    clearSearchNavigationState();
    window.history.replaceState({}, "", "/");
  });

  it("restores query and results after reload only for the exact auth/doctor/clinic scope", () => {
    saveSearchNavigationState(
      scope,
      { query: record.patientId, records: [record] },
      { now: 1_000, ttlMs: 60_000 },
    );
    expect(readSearchNavigationState(scope, { now: 2_000 })).toMatchObject({
      query: record.patientId,
      records: [record],
    });
    expect(
      readSearchNavigationState(
        { ...scope, authUserId: "auth-b" },
        { now: 2_000 },
      ),
    ).toBeNull();
  });

  it("expires state and removes it from the session", () => {
    saveSearchNavigationState(
      scope,
      { query: record.patientId, records: [record] },
      { now: 1_000, ttlMs: 500 },
    );
    expect(readSearchNavigationState(scope, { now: 1_501 })).toBeNull();
    expect(readSearchNavigationState(scope, { now: 1_100 })).toBeNull();
  });

  it("fails closed for corrupt state and storage write/remove exceptions", () => {
    sessionStorage.setItem("bharatdoc-search-navigation-v1", "{");
    expect(readSearchNavigationState(scope)).toBeNull();

    const throwingStorage = {
      getItem: () => "{",
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(() =>
      saveSearchNavigationState(
        scope,
        { query: record.patientId, records: [record] },
        { storage: throwingStorage },
      ),
    ).not.toThrow();
    expect(() => clearSearchNavigationState(throwingStorage)).not.toThrow();
    expect(
      readSearchNavigationState(scope, { storage: throwingStorage }),
    ).toBeNull();
  });

  it("bounds persistence, drops signed URLs, and caps caller-controlled expiry", () => {
    saveSearchNavigationState(
      scope,
      {
        query: record.patientId,
        records: [
          {
            ...record,
            pdfSignedUrl: "https://signed.example.test/report?token=secret",
          },
        ],
      },
      { now: 1_000, ttlMs: Number.POSITIVE_INFINITY },
    );
    expect(
      sessionStorage.getItem("bharatdoc-search-navigation-v1"),
    ).not.toContain("signed.example.test");
    expect(
      readSearchNavigationState(scope, { now: 1_000 + 10 * 60 * 1_000 + 1 }),
    ).toBeNull();
  });

  it("scrubs legacy query and fragment navigation without changing the path", () => {
    window.history.replaceState(
      { safe: true },
      "",
      "/search?patient_id=P-SECRET#result",
    );
    scrubCurrentNavigationUrl();
    expect(window.location.pathname).toBe("/search");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(window.history.state).toEqual({ safe: true });
  });
});
