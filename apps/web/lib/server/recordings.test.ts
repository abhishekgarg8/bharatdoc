import { describe, expect, it, vi } from "vitest";
import type { Doctor } from "@bharatdoc/shared";
import {
  createRecordingMetadataForDoctor,
  listDashboardRecordingsForDoctor,
  searchPatientRecordingsForClinic,
  type RecordingListItem,
  type RecordingsRepository
} from "@/lib/server/recordings";

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-doctor",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

const recording: RecordingListItem = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: activeDoctor.id,
  clinic_id: activeDoctor.clinic_id!,
  patient_id: "P-10482",
  label: null,
  duration_seconds: 494,
  audio_storage_path: null,
  transcript: null,
  summary: null,
  pdf_storage_path: null,
  status: "recorded",
  recorded_at: "2026-04-23T06:12:00.000Z",
  created_at: "2026-04-23T06:12:01.000Z",
  doctor_name: activeDoctor.name
};

function createRepository(doctor: Doctor | null = activeDoctor): RecordingsRepository {
  return {
    findDoctorByFirebaseUid: vi.fn(async () => doctor),
    listRecentRecordings: vi.fn(async () => [recording]),
    searchPatientRecordings: vi.fn(async () => [recording]),
    createRecording: vi.fn(async (input) => ({
      ...recording,
      id: input.id,
      doctor_id: input.doctorId,
      clinic_id: input.clinicId,
      patient_id: input.patientId,
      label: input.label,
      duration_seconds: input.durationSeconds,
      recorded_at: input.recordedAt
    }))
  };
}

describe("recordings service", () => {
  it("lists recent dashboard recordings for active doctors", async () => {
    const repository = createRepository();

    await expect(
      listDashboardRecordingsForDoctor({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).resolves.toEqual([
      {
        id: recording.id,
        patient_id: "P-10482",
        label: null,
        duration_seconds: 494,
        doctor_name: "Dr. Aparna Iyer",
        status: "recorded",
        recorded_at: "2026-04-23T06:12:00.000Z"
      }
    ]);
    expect(repository.listRecentRecordings).toHaveBeenCalledWith(activeDoctor.id, 10);
  });

  it("blocks inactive doctor accounts", async () => {
    const repository = createRepository({ ...activeDoctor, account_status: "pending_approval" });

    await expect(
      listDashboardRecordingsForDoctor({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
  });

  it("searches patient recordings inside the active doctor's clinic", async () => {
    const repository = createRepository();

    await expect(
      searchPatientRecordingsForClinic(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        " p-10482 ",
        repository
      )
    ).resolves.toHaveLength(1);
    expect(repository.searchPatientRecordings).toHaveBeenCalledWith(activeDoctor.clinic_id, "P-10482", 25);
  });

  it("requires patient IDs for patient search", async () => {
    const repository = createRepository();

    await expect(
      searchPatientRecordingsForClinic({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, "  ", repository)
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });
    expect(repository.searchPatientRecordings).not.toHaveBeenCalled();
  });

  it("creates recording metadata with normalized optional fields", async () => {
    const repository = createRepository();
    const input = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      patient_id: " p-10482 ",
      label: "  Follow-up  ",
      duration_seconds: 502,
      recorded_at: "2026-04-23T06:20:00.000Z"
    };

    await expect(
      createRecordingMetadataForDoctor({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, input, repository)
    ).resolves.toMatchObject({
      id: input.id,
      patient_id: "P-10482",
      label: "Follow-up",
      duration_seconds: 502,
      status: "recorded"
    });
    expect(repository.createRecording).toHaveBeenCalledWith({
      id: input.id,
      doctorId: activeDoctor.id,
      clinicId: activeDoctor.clinic_id,
      patientId: "P-10482",
      label: "Follow-up",
      durationSeconds: 502,
      recordedAt: input.recorded_at
    });
  });

  it("requires active doctors to belong to a clinic before writing recordings", async () => {
    const repository = createRepository({ ...activeDoctor, clinic_id: null });

    await expect(
      createRecordingMetadataForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          duration_seconds: 502,
          recorded_at: "2026-04-23T06:20:00.000Z"
        },
        repository
      )
    ).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });
  });
});
