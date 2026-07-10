import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), search: vi.fn() }));

vi.mock("@/lib/server/supabase-auth", () => ({
  createSupabaseAuthVerifier: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));
vi.mock("@/lib/server/supabase", () => ({
  createSupabaseServerClient: () => ({}),
}));
vi.mock("@/lib/server/supabase-recordings-repository", () => ({
  createSupabaseRecordingsRepository: () => ({}),
}));
vi.mock("@/lib/server/recordings", () => ({
  searchPatientRecordingsForClinic: mocks.search,
}));

import { GET, POST } from "@/app/api/patients/search/route";
import { AppError } from "@/lib/server/errors";

const user = { uid: "auth-doctor", phoneNumber: "doctor@example.com" };

function request(method: "GET" | "POST", body?: unknown) {
  return new Request("https://bharatdoc.example/api/patients/search", {
    method,
    headers: {
      Authorization: "Bearer token",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("patient search API privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue(user);
    mocks.search.mockResolvedValue([{ id: "recording-1" }]);
  });

  it("accepts validated POST bodies without putting patient IDs in the URL or cache", async () => {
    const patientId = "P-SENSITIVE-10482";
    const searchRequest = request("POST", { patient_id: patientId, limit: 12 });
    const response = await POST(searchRequest);

    expect(searchRequest.url).not.toContain(patientId);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(mocks.search).toHaveBeenCalledWith(
      user,
      patientId,
      expect.anything(),
      12,
    );
  });

  it("rejects invalid bodies before search", async () => {
    const response = await POST(request("POST", { patient_id: "", limit: 0 }));
    expect(response.status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects unknown fields instead of silently accepting an ambiguous body", async () => {
    const response = await POST(
      request("POST", { patient_id: "P-1", unexpected: true }),
    );
    expect(response.status).toBe(400);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed JSON", "{", "application/json"],
    [
      "oversized patient ID",
      JSON.stringify({ patient_id: "P".repeat(121) }),
      "application/json",
    ],
    [
      "wrong content shape",
      JSON.stringify({ patient_id: ["P-1"] }),
      "application/json",
    ],
    [
      "URL punctuation",
      JSON.stringify({ patient_id: "P-1?token=value" }),
      "application/json",
    ],
    [
      "control characters",
      JSON.stringify({ patient_id: "P-1\nX" }),
      "application/json",
    ],
  ])("rejects %s without search", async (_label, body, contentType) => {
    const response = await POST(
      new Request("https://bharatdoc.example/api/patients/search", {
        method: "POST",
        headers: { Authorization: "Bearer token", "Content-Type": contentType },
        body,
      }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("rejects unsupported or oversized request bodies", async () => {
    const unsupported = await POST(
      new Request("https://bharatdoc.example/api/patients/search", {
        method: "POST",
        headers: {
          Authorization: "Bearer token",
          "Content-Type": "text/plain",
        },
        body: "P-1",
      }),
    );
    const oversized = await POST(
      request("POST", { patient_id: "P-1", padding: "x".repeat(5000) }),
    );
    expect(unsupported.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("deliberately rejects GET without authenticating or reading query identifiers", async () => {
    const response = await GET(
      new Request(
        "https://bharatdoc.example/api/patients/search?patient_id=P-SECRET",
      ),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("P-SECRET");
  });

  it("preserves authentication enforcement without logging identifiers", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await POST(
      new Request("https://bharatdoc.example/api/patients/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: "P-SECRET-42" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.search).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("P-SECRET-42");
    log.mockRestore();
  });

  it("does not reconstruct patient IDs in logs when a scoped search fails", async () => {
    mocks.search.mockRejectedValueOnce(
      new Error("database lookup failed for P-SECRET-42"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request("POST", { patient_id: "P-SECRET-42" }));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(JSON.stringify(log.mock.calls)).not.toContain("P-SECRET-42");
    log.mockRestore();
  });

  it("preserves no-store semantics for cross-clinic denial", async () => {
    mocks.search.mockRejectedValueOnce(
      new AppError(404, "Recording was not found.", "RECORDING_NOT_FOUND"),
    );
    const response = await POST(request("POST", { patient_id: "P-OTHER-1" }));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.search).toHaveBeenCalledWith(
      user,
      "P-OTHER-1",
      expect.anything(),
      25,
    );
  });
});
