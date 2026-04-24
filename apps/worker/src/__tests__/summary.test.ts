import { describe, expect, it, vi } from "vitest";
import type { Doctor, Recording } from "@bharatdoc/shared";
import { DEFAULT_SUMMARY_PROMPT } from "@bharatdoc/shared";
import { summarizeRecording } from "../summary.js";
import type { RecordingProcessingRepository, SummaryClient } from "../types.js";

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-active",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: "Custom note:\n{{transcript}}",
  transcription_lang: "en",
  created_at: "2026-04-23T09:00:00.000Z"
};

const recording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: activeDoctor.id,
  clinic_id: activeDoctor.clinic_id!,
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/recording.webm",
  transcript: "Patient reports fever for two days.",
  summary: null,
  pdf_storage_path: null,
  status: "transcribed",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z"
};

function depsFor(recordingResult: Recording | null = recording, summary = "Chief Complaint: Fever") {
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
  const summaryClient: SummaryClient = {
    summarize: vi.fn(async () => summary)
  };

  return { recordings, summaryClient };
}

describe("worker summary service", () => {
  it("renders the doctor's prompt, generates a summary, and marks the recording ready", async () => {
    const deps = depsFor();

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        deps
      )
    ).resolves.toEqual({
      recording_id: recording.id,
      summary: "Chief Complaint: Fever",
      status: "summary_ready"
    });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(recording.id, activeDoctor.id);
    expect(deps.summaryClient.summarize).toHaveBeenCalledWith({
      prompt: "Custom note:\nPatient reports fever for two days.",
      recording,
      doctor: activeDoctor
    });
    expect(deps.recordings.markRecordingSummarized).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      summary: "Chief Complaint: Fever"
    });
  });

  it("uses the default prompt when the doctor has not customized one", async () => {
    const deps = depsFor();

    await summarizeRecording(
      { doctor: { ...activeDoctor, custom_prompt: null }, token: { uid: activeDoctor.firebase_uid } },
      { recordingId: recording.id },
      deps
    );

    expect(deps.summaryClient.summarize).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: DEFAULT_SUMMARY_PROMPT.replaceAll("{{transcript}}", recording.transcript!)
      })
    );
  });

  it("requires clinic, recording id, recording ownership, patient id, and transcript", async () => {
    await expect(
      summarizeRecording(
        { doctor: { ...activeDoctor, clinic_id: null }, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor()
      )
    ).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        {},
        depsFor()
      )
    ).rejects.toMatchObject({ code: "RECORDING_ID_REQUIRED" });

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: "missing-recording" },
        depsFor(null)
      )
    ).rejects.toMatchObject({ code: "RECORDING_NOT_FOUND" });

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor({ ...recording, patient_id: null })
      )
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor({ ...recording, transcript: "  " })
      )
    ).rejects.toMatchObject({ code: "TRANSCRIPT_REQUIRED" });
  });

  it("rejects empty provider output before updating the recording", async () => {
    const deps = depsFor(recording, "  ");

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        deps
      )
    ).rejects.toMatchObject({ code: "SUMMARY_EMPTY" });

    expect(deps.recordings.markRecordingSummarized).not.toHaveBeenCalled();
  });

  it("invalidates saved PDFs when regenerating a summary after PDF generation", async () => {
    const pdfRecording: Recording = { ...recording, status: "pdf_saved", pdf_storage_path: "pdfs/p-10483.pdf" };
    const deps = depsFor(pdfRecording, "Updated summary");

    await expect(
      summarizeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: pdfRecording.id },
        deps
      )
    ).resolves.toMatchObject({ status: "summary_ready" });

    expect(deps.recordings.markRecordingSummarized).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: pdfRecording.id,
        doctorId: activeDoctor.id,
        summary: "Updated summary"
      })
    );
  });
});
