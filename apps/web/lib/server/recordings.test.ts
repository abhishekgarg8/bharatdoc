import { describe, expect, it, vi } from "vitest";
import type { Doctor } from "@bharatdoc/shared";
import {
  createRecordingMetadataForDoctor,
  getDashboardSnapshotForUser,
  getRecordingDetailForDoctor,
  listDashboardRecordingsForDoctor,
  saveRecordingSummaryForDoctor,
  searchPatientRecordingsForClinic,
  type RecordingListItem,
  type RecordingsRepository
} from "@/lib/server/recordings";

const clinic = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sunrise Hospital",
  clinic_code: "MED42X",
  address: "24 Baner Road, Pune",
  logo_storage_path: null,
  created_at: "2026-04-23T09:00:00.000Z"
};

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-doctor",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
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
  transcript: "Patient reports fever for two days.",
  summary: null,
  pdf_storage_path: null,
  status: "transcribed",
  recorded_at: "2026-04-23T06:12:00.000Z",
  created_at: "2026-04-23T06:12:01.000Z",
  doctor_name: activeDoctor.name
};

function createRepository(doctor: Doctor | null = activeDoctor): RecordingsRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => doctor),
    findClinicById: vi.fn(async () => clinic),
    countPendingJoinRequests: vi.fn(async () => 0),
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
      status: "recorded" as const,
      recorded_at: input.recordedAt
    })),
    findRecordingForClinic: vi.fn(async () => recording),
    findRecordingForDoctor: vi.fn(async () => recording),
    updateRecordingSummary: vi.fn(async (input) => ({
      ...recording,
      summary: input.summary,
      status: "summary_ready" as const,
      pdf_storage_path: null
    })),
    createPdfSignedUrl: vi.fn(async () => "https://signed.example.com/recording.pdf")
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
        clinic_name: null,
        duration_seconds: 494,
        doctor_name: "Dr. Aparna Iyer",
        status: "transcribed",
        recorded_at: "2026-04-23T06:12:00.000Z",
        pdf_storage_path: null,
        pdf_signed_url: null
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

  it("returns doctor context and records in one dashboard snapshot", async () => {
    const repository = createRepository();

    await expect(
      getDashboardSnapshotForUser({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).resolves.toMatchObject({
      doctor: activeDoctor,
      clinic: {
        id: clinic.id,
        name: "Sunrise Hospital",
        code: "MED42X"
      },
      pending_approvals_count: 0,
      records: [
        {
          id: recording.id,
          patient_id: "P-10482",
          clinic_name: "Sunrise Hospital",
          doctor_name: "Dr. Aparna Iyer"
        }
      ]
    });
    expect(repository.findClinicById).toHaveBeenCalledWith(activeDoctor.clinic_id);
    expect(repository.countPendingJoinRequests).not.toHaveBeenCalled();
    expect(repository.listRecentRecordings).toHaveBeenCalledWith(activeDoctor.id, 10);
  });

  it("returns real pending approval counts for owner dashboard snapshots", async () => {
    const repository = createRepository({ ...activeDoctor, role: "owner" });
    vi.mocked(repository.countPendingJoinRequests).mockResolvedValueOnce(2);

    await expect(
      getDashboardSnapshotForUser({ uid: "firebase-owner", phoneNumber: "+919876543210" }, repository)
    ).resolves.toMatchObject({
      pending_approvals_count: 2
    });
    expect(repository.countPendingJoinRequests).toHaveBeenCalledWith(activeDoctor.clinic_id);
  });

  it("returns inactive doctor context without loading dashboard recordings", async () => {
    const repository = createRepository({ ...activeDoctor, account_status: "pending_approval" });

    await expect(
      getDashboardSnapshotForUser({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).resolves.toMatchObject({
      doctor: { account_status: "pending_approval" },
      clinic: null,
      pending_approvals_count: 0,
      records: []
    });
    expect(repository.listRecentRecordings).not.toHaveBeenCalled();
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
    expect(repository.findClinicById).toHaveBeenCalledWith(activeDoctor.clinic_id);
    expect(repository.searchPatientRecordings).toHaveBeenCalledWith(activeDoctor.clinic_id, "P-10482", 25);
  });

  it("returns search-specific clinic, label, and signed PDF context", async () => {
    const repository = createRepository();
    vi.mocked(repository.searchPatientRecordings).mockResolvedValueOnce([
      {
        ...recording,
        label: "Follow-up",
        status: "pdf_saved",
        pdf_storage_path: "pdfs/p-10482.pdf"
      }
    ]);

    await expect(
      searchPatientRecordingsForClinic(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        "P-10482",
        repository
      )
    ).resolves.toMatchObject([
      {
        label: "Follow-up",
        clinic_name: "Sunrise Hospital",
        pdf_storage_path: "pdfs/p-10482.pdf",
        pdf_signed_url: "https://signed.example.com/recording.pdf"
      }
    ]);
    expect(repository.createPdfSignedUrl).toHaveBeenCalledWith("pdfs/p-10482.pdf");
  });

  it("requires patient IDs for patient search", async () => {
    const repository = createRepository();

    await expect(
      searchPatientRecordingsForClinic({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, "  ", repository)
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });
    expect(repository.searchPatientRecordings).not.toHaveBeenCalled();
  });

  it("loads recording detail inside the active doctor's clinic", async () => {
    const repository = createRepository();

    await expect(
      getRecordingDetailForDoctor({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, recording.id, repository)
    ).resolves.toEqual({
      id: recording.id,
      patient_id: "P-10482",
      label: null,
      duration_seconds: 494,
      doctor_name: "Dr. Aparna Iyer",
      status: "transcribed",
      recorded_at: "2026-04-23T06:12:00.000Z",
      transcript: "Patient reports fever for two days.",
      summary: null,
      pdf_storage_path: null,
      pdf_signed_url: null
    });
    expect(repository.findRecordingForClinic).toHaveBeenCalledWith(recording.id, activeDoctor.clinic_id);
  });

  it("loads a fresh signed PDF URL for saved PDF recordings", async () => {
    const repository = createRepository();
    vi.mocked(repository.findRecordingForClinic).mockResolvedValueOnce({
      ...recording,
      status: "pdf_saved",
      pdf_storage_path: "clinic/doctor/recording.pdf"
    });

    await expect(
      getRecordingDetailForDoctor({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, recording.id, repository)
    ).resolves.toMatchObject({
      pdf_storage_path: "clinic/doctor/recording.pdf",
      pdf_signed_url: "https://signed.example.com/recording.pdf"
    });
    expect(repository.createPdfSignedUrl).toHaveBeenCalledWith("clinic/doctor/recording.pdf");
  });

  it("saves edited summaries and advances transcribed recordings to summary ready", async () => {
    const repository = createRepository();

    await expect(
      saveRecordingSummaryForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        recording.id,
        "  Chief Complaint: Fever  ",
        repository
      )
    ).resolves.toMatchObject({
      id: recording.id,
      summary: "Chief Complaint: Fever",
      status: "summary_ready"
    });
    expect(repository.updateRecordingSummary).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      summary: "Chief Complaint: Fever"
    });
  });

  it("invalidates stale PDFs when saving edited summaries", async () => {
    const repository = createRepository();
    vi.mocked(repository.findRecordingForDoctor).mockResolvedValueOnce({
      ...recording,
      status: "pdf_saved",
      pdf_storage_path: "pdfs/p-10482.pdf"
    });

    await expect(
      saveRecordingSummaryForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        recording.id,
        "Updated summary",
        repository
      )
    ).resolves.toMatchObject({
      status: "summary_ready",
      pdf_storage_path: null
    });

    expect(repository.updateRecordingSummary).toHaveBeenCalledWith(
      expect.objectContaining({ doctorId: activeDoctor.id })
    );
  });

  it("does not allow same-clinic doctors to edit recordings they do not own", async () => {
    const repository = createRepository();
    vi.mocked(repository.findRecordingForDoctor).mockResolvedValueOnce(null);

    await expect(
      saveRecordingSummaryForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        recording.id,
        "Updated summary",
        repository
      )
    ).rejects.toMatchObject({ code: "RECORDING_NOT_FOUND" });
    expect(repository.updateRecordingSummary).not.toHaveBeenCalled();
  });

  it("requires patient id, transcript, and summary text before saving summaries", async () => {
    const missingPatientRepository = createRepository();
    vi.mocked(missingPatientRepository.findRecordingForDoctor).mockResolvedValueOnce({
      ...recording,
      patient_id: null
    });

    await expect(
      saveRecordingSummaryForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        recording.id,
        "Summary",
        missingPatientRepository
      )
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });

    const missingTranscriptRepository = createRepository();
    vi.mocked(missingTranscriptRepository.findRecordingForDoctor).mockResolvedValueOnce({
      ...recording,
      transcript: null
    });

    await expect(
      saveRecordingSummaryForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        recording.id,
        "Summary",
        missingTranscriptRepository
      )
    ).rejects.toMatchObject({ code: "TRANSCRIPT_REQUIRED" });

    await expect(
      saveRecordingSummaryForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        recording.id,
        "   ",
        createRepository()
      )
    ).rejects.toMatchObject({ code: "SUMMARY_REQUIRED" });
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

  it("requires Patient ID before creating server recording metadata for transcription", async () => {
    const repository = createRepository();

    await expect(
      createRecordingMetadataForDoctor(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          patient_id: "   ",
          label: "Follow-up",
          duration_seconds: 502,
          recorded_at: "2026-04-23T06:20:00.000Z"
        },
        repository
      )
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });
    expect(repository.createRecording).not.toHaveBeenCalled();
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
