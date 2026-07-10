import type { Doctor } from "@bharatdoc/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findDoctorByAuthUid: vi.fn(),
  insertLogs: vi.fn(),
  listLogsForClinic: vi.fn()
}));

vi.mock("@/lib/server/supabase-auth", () => ({
  createSupabaseAuthVerifier: () => ({ verifyIdToken: mocks.verifyIdToken })
}));
vi.mock("@/lib/server/supabase", () => ({ createSupabaseServerClient: () => ({}) }));
vi.mock("@/lib/server/supabase-diagnostic-log-repository", () => ({
  createSupabaseDiagnosticLogRepository: () => ({
    findDoctorByAuthUid: mocks.findDoctorByAuthUid,
    insertLogs: mocks.insertLogs,
    listLogsForClinic: mocks.listLogsForClinic
  })
}));

import { GET, POST } from "@/app/api/device-logs/route";

const owner: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "auth-owner",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "owner",
  account_status: "active",
  name: "Dr. Owner",
  specialization: "General Medicine",
  phone: "owner@example.com",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-05-17T00:00:00.000Z"
};
const authUser = { uid: owner.firebase_uid, phoneNumber: owner.phone };
const batch = {
  device_id: "device-1",
  session_id: "session-1",
  logs: [{ id: "log-1", level: "info", event: "recording.capture_started" }]
};

function request(method: "GET" | "POST", authenticated = true): Request {
  return new Request("http://localhost/api/device-logs?patient_id=P-123", {
    method,
    headers: {
      ...(authenticated ? { Authorization: "Bearer token" } : {}),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {})
    },
    ...(method === "POST" ? { body: JSON.stringify(batch) } : {})
  });
}

describe("device log API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyIdToken.mockResolvedValue(authUser);
    mocks.findDoctorByAuthUid.mockResolvedValue(owner);
    mocks.insertLogs.mockResolvedValue(undefined);
    mocks.listLogsForClinic.mockResolvedValue([]);
  });

  it.each(["GET", "POST"] as const)("returns 401 for unauthenticated %s requests", async (method) => {
    const response = await (method === "GET" ? GET(request(method, false)) : POST(request(method, false)));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "AUTH_REQUIRED" } });
    expect(mocks.findDoctorByAuthUid).not.toHaveBeenCalled();
  });

  it("returns 403 when a pending doctor posts telemetry", async () => {
    mocks.findDoctorByAuthUid.mockResolvedValue({ ...owner, role: "doctor", account_status: "pending_approval" });

    const response = await POST(request("POST"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCOUNT_INACTIVE" } });
    expect(mocks.insertLogs).not.toHaveBeenCalled();
  });

  it("returns 403 when a rejected owner reads telemetry", async () => {
    mocks.findDoctorByAuthUid.mockResolvedValue({ ...owner, account_status: "rejected" });

    const response = await GET(request("GET"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "ACCOUNT_INACTIVE" } });
    expect(mocks.listLogsForClinic).not.toHaveBeenCalled();
  });

  it("returns 403 when an active non-owner reads telemetry", async () => {
    mocks.findDoctorByAuthUid.mockResolvedValue({ ...owner, role: "doctor" });

    const response = await GET(request("GET"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "OWNER_REQUIRED" } });
  });

  it("allows active doctors to ingest and active owners to read only redacted clinic logs", async () => {
    mocks.listLogsForClinic.mockResolvedValue([
      {
        source: "device",
        level: "error",
        event: "recording.transcription_failed",
        message: "Patient P-123 audio/private/secret.webm",
        doctor_id: owner.id,
        clinic_id: owner.clinic_id,
        recording_id: null,
        patient_id: "P-123",
        request_id: null,
        session_id: "session-1",
        device_id: "device-1",
        app_version: "abc123",
        user_agent: "agent",
        url: "https://example.com/recording?patient=P-123",
        client_created_at: null,
        created_at: "2026-05-17T12:00:00.000Z",
        metadata: { audio_storage_path: "audio/private/secret.webm" }
      }
    ]);

    expect((await POST(request("POST"))).status).toBe(202);
    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.listLogsForClinic).toHaveBeenCalledWith(owner.clinic_id, expect.objectContaining({ patientId: "P-123" }));
    expect(JSON.stringify(payload)).not.toMatch(/P-123|secret\.webm|https:\/\//);
  });

  it("redacts crafted event names that could smuggle sensitive data", async () => {
    const crafted = new Request("http://localhost/api/device-logs", {
      method: "POST",
      headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ ...batch, logs: [{ ...batch.logs[0], event: "Patient P-123 at https://example.com" }] })
    });

    expect((await POST(crafted)).status).toBe(202);
    expect(mocks.insertLogs).toHaveBeenCalledWith([expect.objectContaining({ event: "diagnostic.unknown" })]);
  });

  it("applies account and role revocation on the immediately following request", async () => {
    expect((await POST(request("POST"))).status).toBe(202);
    mocks.findDoctorByAuthUid.mockResolvedValue({ ...owner, account_status: "rejected" });
    expect((await POST(request("POST"))).status).toBe(403);
    expect(mocks.insertLogs).toHaveBeenCalledTimes(1);

    mocks.findDoctorByAuthUid.mockResolvedValue(owner);
    expect((await GET(request("GET"))).status).toBe(200);
    mocks.findDoctorByAuthUid.mockResolvedValue({ ...owner, role: "doctor" });
    expect((await GET(request("GET"))).status).toBe(403);
    expect(mocks.listLogsForClinic).toHaveBeenCalledTimes(1);
  });
});
