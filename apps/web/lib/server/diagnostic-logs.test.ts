import type { Doctor } from "@bharatdoc/shared";
import { describe, expect, it, vi } from "vitest";
import {
  ingestDeviceLogsForUser,
  listDiagnosticLogsForUser,
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

function repositoryFor(foundDoctor: Doctor | null = doctor): DiagnosticLogRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => foundDoctor),
    insertLogs: vi.fn(async () => undefined),
    listLogsForClinic: vi.fn(async () => [])
  };
}

describe("diagnostic log ingestion", () => {
  it("maps device logs to private diagnostic rows for the authenticated doctor", async () => {
    const repository = repositoryFor();

    await expect(
      ingestDeviceLogsForUser(
        { uid: doctor.firebase_uid, phoneNumber: doctor.phone },
        {
          device_id: "device-1",
          session_id: "session-1",
          logs: [
            {
              id: "client-log-1",
              level: "error",
              event: "recording.detail_transcription_failed",
              message: "Original audio is not available on this device.",
              recordingId: "33333333-3333-4333-8333-333333333333",
              patientId: " P-123 ",
              createdAt: "2026-05-17T12:00:00.000Z",
              metadata: {
                local_audio_available: false
              }
            }
          ]
        },
        repository
      )
    ).resolves.toEqual({ accepted: 1 });

    expect(repository.insertLogs).toHaveBeenCalledWith([
      expect.objectContaining({
        source: "device",
        level: "error",
        event: "recording.detail_transcription_failed",
        doctor_id: doctor.id,
        clinic_id: doctor.clinic_id,
        recording_id: "33333333-3333-4333-8333-333333333333",
        patient_id: "P-123",
        device_id: "device-1",
        session_id: "session-1",
        client_created_at: "2026-05-17T12:00:00.000Z",
        metadata: {
          client_log_id: "client-log-1",
          local_audio_available: false
        }
      })
    ]);
  });

  it("scopes diagnostic log listing to the authenticated clinic", async () => {
    const repository = repositoryFor();

    await listDiagnosticLogsForUser(
      { uid: doctor.firebase_uid, phoneNumber: doctor.phone },
      { patientId: " P-123 ", limit: 20 },
      repository
    );

    expect(repository.listLogsForClinic).toHaveBeenCalledWith(doctor.clinic_id, {
      patientId: "P-123",
      limit: 20
    });
  });
});
