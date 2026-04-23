import { describe, expect, it, vi } from "vitest";
import type { Doctor, Recording } from "@bharatdoc/shared";
import {
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  transcribeUploadedRecording,
  transcriptionLanguageHint
} from "../transcription.js";
import type { AudioStorage, RecordingProcessingRepository, TranscriptionClient } from "../types.js";

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
  custom_prompt: null,
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
  audio_storage_path: null,
  transcript: null,
  summary: null,
  pdf_storage_path: null,
  status: "recorded",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z"
};

function audioFile(size = 5): Express.Multer.File {
  return {
    buffer: Buffer.alloc(size, "a"),
    destination: "",
    encoding: "7bit",
    fieldname: "audio",
    filename: "",
    mimetype: "audio/webm",
    originalname: "recording.webm",
    path: "",
    size,
    stream: null as never
  };
}

function depsFor(recordingResult: Recording | null = recording) {
  const recordings: RecordingProcessingRepository = {
    findRecordingForDoctor: vi.fn(async () => recordingResult),
    markRecordingTranscribed: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      audio_storage_path: input.audioStoragePath,
      transcript: input.transcript,
      status: "transcribed" as const
    }))
  };
  const audioStorage: AudioStorage = {
    uploadRecordingAudio: vi.fn(async () => "clinic/doctor/recording.webm")
  };
  const transcriptionClient: TranscriptionClient = {
    transcribe: vi.fn(async () => "Patient reports fever.")
  };

  return { audioStorage, recordings, transcriptionClient };
}

describe("worker transcription service", () => {
  it("maps explicit language hints and leaves auto/mixed unspecified", () => {
    expect(transcriptionLanguageHint("hi")).toBe("hi");
    expect(transcriptionLanguageHint("en")).toBe("en");
    expect(transcriptionLanguageHint("auto")).toBeUndefined();
    expect(transcriptionLanguageHint("hien")).toBeUndefined();
  });

  it("uploads audio, transcribes it, and marks recording transcribed", async () => {
    const deps = depsFor();
    const audio = audioFile();

    await expect(
      transcribeUploadedRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { audio, recordingId: recording.id },
        deps
      )
    ).resolves.toEqual({
      recording_id: recording.id,
      transcript: "Patient reports fever."
    });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(recording.id, activeDoctor.id);
    expect(deps.audioStorage.uploadRecordingAudio).toHaveBeenCalledWith({
      audio,
      clinicId: activeDoctor.clinic_id,
      doctorId: activeDoctor.id,
      recordingId: recording.id
    });
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalledWith({
      audio,
      language: "en"
    });
    expect(deps.recordings.markRecordingTranscribed).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      audioStoragePath: "clinic/doctor/recording.webm",
      transcript: "Patient reports fever."
    });
  });

  it("requires a clinic, recording, patient id, and audio", async () => {
    await expect(
      transcribeUploadedRecording(
        { doctor: { ...activeDoctor, clinic_id: null }, token: { uid: activeDoctor.firebase_uid } },
        { audio: audioFile(), recordingId: recording.id },
        depsFor()
      )
    ).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });

    await expect(
      transcribeUploadedRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { audio: audioFile(), recordingId: "missing-recording" },
        depsFor(null)
      )
    ).rejects.toMatchObject({ code: "RECORDING_NOT_FOUND" });

    await expect(
      transcribeUploadedRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { audio: audioFile(), recordingId: recording.id },
        depsFor({ ...recording, patient_id: null })
      )
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });

    await expect(
      transcribeUploadedRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor()
      )
    ).rejects.toMatchObject({ code: "AUDIO_REQUIRED" });
  });

  it("rejects audio beyond the Phase 1 size limit before storage or OpenAI calls", async () => {
    const deps = depsFor();

    await expect(
      transcribeUploadedRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { audio: audioFile(MAX_TRANSCRIPTION_AUDIO_BYTES + 1), recordingId: recording.id },
        deps
      )
    ).rejects.toMatchObject({ code: "AUDIO_TOO_LARGE" });

    expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
  });
});
