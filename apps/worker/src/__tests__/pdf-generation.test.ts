import { describe, expect, it, vi } from "vitest";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import { generateRecordingPdf } from "../pdf-generation.js";
import type { ClinicRepository, PdfRenderer, PdfStorage, RecordingProcessingRepository } from "../types.js";

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-active",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "en",
  created_at: "2026-04-23T09:00:00.000Z"
};

const clinic: Clinic = {
  id: activeDoctor.clinic_id!,
  name: "Sunrise Clinic",
  clinic_code: "MED42X",
  address: "Pune",
  logo_storage_path: null,
  created_at: "2026-04-23T05:00:00.000Z"
};

const recording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: activeDoctor.id,
  clinic_id: clinic.id,
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/recording.webm",
  transcript: "Patient reports fever for two days.",
  summary: "Chief Complaint: Fever\nPlan: Fluids and paracetamol.",
  pdf_storage_path: null,
  status: "summary_ready",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z"
};

function depsFor(recordingResult: Recording | null = recording, clinicResult: Clinic | null = clinic) {
  const recordings: RecordingProcessingRepository = {
    findRecordingForDoctor: vi.fn(async () => recordingResult),
    markRecordingTranscribed: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      audio_storage_path: input.audioStoragePath,
      transcript: input.transcript,
      status: "transcribed" as const
    })),
    markRecordingSummarized: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      summary: input.summary,
      status: "summary_ready" as const,
      pdf_storage_path: null
    })),
    markRecordingPdfSaved: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      pdf_storage_path: input.pdfStoragePath,
      status: "pdf_saved" as const
    }))
  };
  const clinics: ClinicRepository = {
    findClinicById: vi.fn(async () => clinicResult)
  };
  const pdfRenderer: PdfRenderer = {
    render: vi.fn(async () => Buffer.from("%PDF-1.4\n"))
  };
  const pdfStorage: PdfStorage = {
    uploadRecordingPdf: vi.fn(async () => "clinic/doctor/recording.pdf"),
    createSignedUrl: vi.fn(async () => "https://signed.example.com/recording.pdf")
  };

  return { clinics, pdfRenderer, pdfStorage, recordings };
}

describe("worker PDF generation service", () => {
  it("renders, uploads, signs, and marks PDFs saved", async () => {
    const deps = depsFor();

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id, generatedAt: new Date("2026-04-23T09:00:00.000Z") },
        deps
      )
    ).resolves.toEqual({
      recording_id: recording.id,
      pdf_storage_path: "clinic/doctor/recording.pdf",
      signed_url: "https://signed.example.com/recording.pdf",
      status: "pdf_saved"
    });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(recording.id, activeDoctor.id);
    expect(deps.clinics.findClinicById).toHaveBeenCalledWith(activeDoctor.clinic_id);
    expect(deps.pdfRenderer.render).toHaveBeenCalledWith({
      clinic,
      doctor: activeDoctor,
      recording,
      generatedAt: new Date("2026-04-23T09:00:00.000Z")
    });
    expect(deps.pdfStorage.uploadRecordingPdf).toHaveBeenCalledWith({
      pdf: Buffer.from("%PDF-1.4\n"),
      clinicId: clinic.id,
      doctorId: activeDoctor.id,
      recordingId: recording.id
    });
    expect(deps.recordings.markRecordingPdfSaved).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      pdfStoragePath: "clinic/doctor/recording.pdf"
    });
  });

  it("requires clinic, recording id, clinic lookup, patient id, and summary", async () => {
    await expect(
      generateRecordingPdf(
        { doctor: { ...activeDoctor, clinic_id: null }, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor()
      )
    ).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        {},
        depsFor()
      )
    ).rejects.toMatchObject({ code: "RECORDING_ID_REQUIRED" });

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor(null)
      )
    ).rejects.toMatchObject({ code: "RECORDING_NOT_FOUND" });

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor(recording, null)
      )
    ).rejects.toMatchObject({ code: "CLINIC_NOT_FOUND" });

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor({ ...recording, patient_id: null })
      )
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor({ ...recording, summary: "  " })
      )
    ).rejects.toMatchObject({ code: "SUMMARY_REQUIRED" });
  });

  it("rejects empty rendered PDFs before storage", async () => {
    const deps = depsFor();
    vi.mocked(deps.pdfRenderer.render).mockResolvedValueOnce(Buffer.alloc(0));

    await expect(
      generateRecordingPdf(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        deps
      )
    ).rejects.toMatchObject({ code: "PDF_RENDER_FAILED" });

    expect(deps.pdfStorage.uploadRecordingPdf).not.toHaveBeenCalled();
    expect(deps.recordings.markRecordingPdfSaved).not.toHaveBeenCalled();
  });
});
