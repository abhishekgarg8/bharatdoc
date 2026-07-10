import type { Doctor } from "@bharatdoc/shared";
import { describe, expect, it, vi } from "vitest";
import {
  ingestDeviceLogsForUser,
  listDiagnosticLogsForUser,
  type DiagnosticLogListFilters,
  type DiagnosticLogRepository
} from "@/lib/server/diagnostic-logs";

const doctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "auth-user-1",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "owner",
  account_status: "active",
  name: "Dr. Test",
  specialization: "General Medicine",
  phone: "doctor@example.com",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-05-17T00:00:00.000Z"
};
const user = { uid: doctor.firebase_uid, phoneNumber: doctor.phone };
const batch = {
  device_id: "device-1",
  session_id: "session-1",
  logs: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      level: "error" as const,
      event: "recording.detail_transcription_failed",
      message: "Patient P-123 failed at audio/private/secret.webm",
      recordingId: "33333333-3333-4333-8333-333333333333",
      patientId: " P-123 ",
      url: "https://bharatdoc-web.vercel.app/recordings/333?patient_id=P-123",
      createdAt: "2026-05-17T12:00:00.000Z",
      sessionId: "Patient P-123 at audio/private/secret.webm",
      deviceId: "https://example.com/P-123",
      userAgent: "Sensitive user agent",
      metadata: {
        local_audio_available: false,
        audio_storage_path: "audio/private/secret.webm",
        audio_mime_type: "audio/private/secret.webm",
        status: "P-123"
      }
    }
  ]
};
const rawLog = {
  source: "device" as const,
  level: "error" as const,
  event: "recording.transcription_failed",
  message: "Patient P-123 failed at audio/private/secret.webm",
  doctor_id: doctor.id,
  clinic_id: doctor.clinic_id,
  recording_id: "33333333-3333-4333-8333-333333333333",
  patient_id: "P-123",
  request_id: "request-1",
  session_id: "session-1",
  device_id: "device-1",
  app_version: "abc123",
  user_agent: "Sensitive user agent",
  url: "https://bharatdoc-web.vercel.app/recordings/secret?patient_id=P-123",
  client_created_at: "2026-05-17T12:00:00.000Z",
  created_at: "2026-05-17T12:00:01.000Z",
  metadata: { audio_storage_path: "audio/private/secret.webm", patient_id: "P-123" }
};

function repositoryFor(foundDoctor: Doctor | null = doctor): DiagnosticLogRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => foundDoctor),
    insertLogs: vi.fn(async () => undefined),
    listLogsForClinic: vi.fn(async () => [])
  };
}

describe("diagnostic log ingestion", () => {
  it("minimizes untrusted device telemetry before persisting it", async () => {
    const repository = repositoryFor();

    await expect(ingestDeviceLogsForUser(user, batch, repository)).resolves.toEqual({ accepted: 1 });
    expect(repository.insertLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        source: "device",
        doctor_id: doctor.id,
        clinic_id: doctor.clinic_id,
        recording_id: "33333333-3333-4333-8333-333333333333",
        message: null,
        patient_id: null,
        request_id: null,
        session_id: null,
        device_id: null,
        user_agent: null,
        url: null,
        metadata: {
          client_log_id: "44444444-4444-4444-8444-444444444444",
          local_audio_available: false
        }
      })
    ]);
  });

  it.each(["pending_approval", "rejected"] as const)("blocks %s doctors", async (accountStatus) => {
    const repository = repositoryFor({ ...doctor, account_status: accountStatus });

    await expect(ingestDeviceLogsForUser(user, batch, repository)).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE"
    });
    expect(repository.insertLogs).not.toHaveBeenCalled();
  });

  it("rejects unscoped ingestion when an active doctor has no clinic", async () => {
    const repository = repositoryFor({ ...doctor, clinic_id: null });

    await expect(ingestDeviceLogsForUser(user, batch, repository)).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });
    expect(repository.insertLogs).not.toHaveBeenCalled();
  });

  it("honors account revocation on the next request", async () => {
    let currentDoctor: Doctor = doctor;
    const repository = repositoryFor();
    vi.mocked(repository.findDoctorByAuthUid).mockImplementation(async () => currentDoctor);

    await expect(ingestDeviceLogsForUser(user, batch, repository)).resolves.toEqual({ accepted: 1 });
    currentDoctor = { ...doctor, account_status: "rejected" };
    await expect(ingestDeviceLogsForUser(user, batch, repository)).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE"
    });
    expect(repository.insertLogs).toHaveBeenCalledTimes(1);
  });
});

describe("diagnostic log listing", () => {
  it("uses only filters inside the authenticated owner's clinic scope", async () => {
    const repository = repositoryFor();

    await listDiagnosticLogsForUser(
      user,
      {
        patientId: " P-123 ",
        recordingId: rawLog.recording_id,
        deviceId: " device-1 ",
        limit: 20,
        clinicId: "99999999-9999-4999-8999-999999999999"
      } as DiagnosticLogListFilters,
      repository
    );

    expect(repository.listLogsForClinic).toHaveBeenCalledWith(doctor.clinic_id, {
      patientId: "P-123",
      recordingId: rawLog.recording_id,
      deviceId: "device-1",
      limit: 20
    });
  });

  it.each(["pending_approval", "rejected"] as const)("blocks %s owners", async (accountStatus) => {
    const repository = repositoryFor({ ...doctor, account_status: accountStatus });

    await expect(listDiagnosticLogsForUser(user, {}, repository)).rejects.toMatchObject({
      code: "ACCOUNT_INACTIVE"
    });
    expect(repository.listLogsForClinic).not.toHaveBeenCalled();
  });

  it("blocks active non-owner doctors", async () => {
    const repository = repositoryFor({ ...doctor, role: "doctor" });

    await expect(listDiagnosticLogsForUser(user, {}, repository)).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    expect(repository.listLogsForClinic).not.toHaveBeenCalled();
  });

  it("returns only a safe allowlist of fields", async () => {
    const repository = repositoryFor();
    vi.mocked(repository.listLogsForClinic).mockResolvedValue([rawLog]);

    const logs = await listDiagnosticLogsForUser(user, {}, repository);

    expect(logs).toEqual([
      {
        source: rawLog.source,
        level: rawLog.level,
        event: rawLog.event,
        doctor_id: rawLog.doctor_id,
        recording_id: rawLog.recording_id,
        client_created_at: rawLog.client_created_at,
        created_at: rawLog.created_at
      }
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/P-123|secret\.webm|https:\/\//);
  });

  it("redacts legacy or crafted event names", async () => {
    const repository = repositoryFor();
    vi.mocked(repository.listLogsForClinic).mockResolvedValue([{ ...rawLog, event: "Patient P-123 at https://example.com" }]);

    await expect(listDiagnosticLogsForUser(user, {}, repository)).resolves.toEqual([
      expect.objectContaining({ event: "diagnostic.unknown" })
    ]);
  });

  it("honors role revocation on the next request", async () => {
    let currentDoctor: Doctor = doctor;
    const repository = repositoryFor();
    vi.mocked(repository.findDoctorByAuthUid).mockImplementation(async () => currentDoctor);

    await expect(listDiagnosticLogsForUser(user, {}, repository)).resolves.toEqual([]);
    currentDoctor = { ...doctor, role: "doctor" };
    await expect(listDiagnosticLogsForUser(user, {}, repository)).rejects.toMatchObject({ code: "OWNER_REQUIRED" });
    expect(repository.listLogsForClinic).toHaveBeenCalledTimes(1);
  });
});
