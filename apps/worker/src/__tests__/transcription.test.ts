import { describe, expect, it, vi } from "vitest";
import type { Doctor, Recording } from "@bharatdoc/shared";
import { transcribeRecording } from "../transcription.js";
import type {
  AudioStorage,
  RecordingProcessingRepository,
  TranscriptionAttemptRepository,
  TranscriptionClient,
} from "../types.js";

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
  transcription_lang: "hien",
  created_at: "2026-04-23T09:00:00.000Z",
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
  created_at: "2026-04-23T06:20:01.000Z",
};

function fileInput(size = 5) {
  return {
    buffer: Buffer.alloc(size, "a"),
    mimetype: "audio/webm",
    originalname: "recording.webm",
    size,
  };
}

function depsFor(
  recordingResult: Recording | null = recording,
  transcript = "Patient reports fever.",
) {
  const recordings: RecordingProcessingRepository = {
    findRecordingForDoctor: vi.fn(async () => recordingResult),
    markRecordingTranscribed: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      audio_storage_path: input.audioStoragePath,
      transcript: input.transcript,
      status: "transcribed" as const,
    })),
    markRecordingSummarized: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      summary: input.summary,
      status: "summary_ready" as const,
      pdf_storage_path: null,
    })),
    markRecordingPdfSaved: vi.fn(async (input) => ({
      ...(recordingResult ?? recording),
      pdf_storage_path: input.pdfStoragePath,
      status: "pdf_saved" as const,
    })),
  };
  const audioStorage: AudioStorage = {
    uploadRecordingAudio: vi.fn(async () => "clinic/doctor/recording.webm"),
  };
  const transcriptionClient: TranscriptionClient = {
    transcribe: vi.fn(async () => transcript),
  };

  return { recordings, audioStorage, transcriptionClient };
}

describe("transcribeRecording", () => {
  it("uploads audio, calls the transcription client, and marks the recording transcribed", async () => {
    const deps = depsFor();

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id, audio: fileInput() },
        deps,
      ),
    ).resolves.toEqual({
      recording_id: recording.id,
      transcript: "Patient reports fever.",
      audio_storage_path: "clinic/doctor/recording.webm",
      status: "transcribed",
    });

    expect(deps.recordings.findRecordingForDoctor).toHaveBeenCalledWith(
      recording.id,
      activeDoctor.id,
    );
    expect(deps.audioStorage.uploadRecordingAudio).toHaveBeenCalledWith({
      audio: expect.any(Buffer),
      mimeType: "audio/webm",
      clinicId: activeDoctor.clinic_id,
      doctorId: activeDoctor.id,
      recordingId: recording.id,
      filename: "recording.webm",
    });
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalledWith({
      audio: expect.any(Buffer),
      mimeType: "audio/webm",
      filename: "recording.webm",
      language: "hien",
    });
    expect(deps.recordings.markRecordingTranscribed).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      transcript: "Patient reports fever.",
      audioStoragePath: "clinic/doctor/recording.webm",
    });
  });

  it("rejects missing recording ids, audio, oversized audio, and non-audio uploads", async () => {
    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { audio: fileInput() },
        depsFor(),
      ),
    ).rejects.toMatchObject({ code: "RECORDING_ID_REQUIRED" });

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id },
        depsFor(),
      ),
    ).rejects.toMatchObject({ code: "AUDIO_REQUIRED" });

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        {
          recordingId: recording.id,
          audio: {
            ...fileInput(1),
            size: 26 * 1024 * 1024,
          },
        },
        depsFor(),
      ),
    ).rejects.toMatchObject({ code: "AUDIO_TOO_LARGE" });

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        {
          recordingId: recording.id,
          audio: {
            ...fileInput(),
            mimetype: "text/plain",
          },
        },
        depsFor(),
      ),
    ).rejects.toMatchObject({ code: "AUDIO_TYPE_INVALID" });
  });

  it("rejects missing clinics and missing recordings", async () => {
    await expect(
      transcribeRecording(
        {
          doctor: { ...activeDoctor, clinic_id: null },
          token: { uid: activeDoctor.firebase_uid },
        },
        { recordingId: recording.id, audio: fileInput() },
        depsFor(),
      ),
    ).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id, audio: fileInput() },
        depsFor(null),
      ),
    ).rejects.toMatchObject({ code: "RECORDING_NOT_FOUND" });
  });

  it("requires Patient ID before transcription work starts", async () => {
    const deps = depsFor({ ...recording, patient_id: null });

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id, audio: fileInput() },
        deps,
      ),
    ).rejects.toMatchObject({ code: "PATIENT_ID_REQUIRED" });
    expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
    expect(deps.recordings.markRecordingTranscribed).not.toHaveBeenCalled();
  });

  it.each(["summary_ready", "pdf_saved"] as const)(
    "rejects re-transcription for %s recordings before audio work",
    async (status) => {
      const deps = depsFor({
        ...recording,
        audio_storage_path: "clinic/doctor/original.webm",
        transcript: "Original transcript.",
        summary: "Original summary.",
        pdf_storage_path:
          status === "pdf_saved" ? "clinic/doctor/original.pdf" : null,
        status,
      });

      await expect(
        transcribeRecording(
          { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
          { recordingId: recording.id, audio: fileInput() },
          deps,
        ),
      ).rejects.toMatchObject({ code: "RECORDING_NOT_TRANSCRIBABLE" });
      expect(deps.audioStorage.uploadRecordingAudio).not.toHaveBeenCalled();
      expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
      expect(deps.recordings.markRecordingTranscribed).not.toHaveBeenCalled();
    },
  );

  it("does not mark recordings when upload or transcription fails", async () => {
    const storageFailure = depsFor();
    vi.mocked(
      storageFailure.audioStorage.uploadRecordingAudio,
    ).mockRejectedValueOnce(new Error("storage failed"));

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id, audio: fileInput() },
        storageFailure,
      ),
    ).rejects.toThrow("storage failed");
    expect(
      storageFailure.recordings.markRecordingTranscribed,
    ).not.toHaveBeenCalled();

    const transcriptionFailure = depsFor();
    vi.mocked(
      transcriptionFailure.transcriptionClient.transcribe,
    ).mockRejectedValueOnce(new Error("provider failed"));

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        { recordingId: recording.id, audio: fileInput() },
        transcriptionFailure,
      ),
    ).rejects.toThrow("provider failed");
    expect(
      transcriptionFailure.recordings.markRecordingTranscribed,
    ).not.toHaveBeenCalled();
  });

  it("records failed transcription attempts with request id, stage, and sanitized error metadata", async () => {
    const deps = depsFor();
    const transcriptionAttempts: TranscriptionAttemptRepository = {
      recordFailedAttempt: vi.fn(async () => undefined),
    };
    vi.mocked(deps.transcriptionClient.transcribe).mockRejectedValueOnce(
      new Error("provider failed with secret detail"),
    );

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        {
          recordingId: recording.id,
          audio: fileInput(),
          requestId: "req-test-123",
        },
        {
          ...deps,
          transcriptionAttempts,
        },
      ),
    ).rejects.toThrow("provider failed with secret detail");

    expect(transcriptionAttempts.recordFailedAttempt).toHaveBeenCalledWith({
      recordingId: recording.id,
      doctorId: activeDoctor.id,
      clinicId: activeDoctor.clinic_id,
      requestId: "req-test-123",
      stage: "transcribe_audio",
      errorCode: "INTERNAL_ERROR",
      errorMessage: "Internal server error.",
      errorStatus: 500,
      audioStoragePath: "clinic/doctor/recording.webm",
    });
    expect(deps.recordings.markRecordingTranscribed).not.toHaveBeenCalled();
  });

  it("does not mask the original transcription error when attempt persistence fails", async () => {
    const deps = depsFor();
    const transcriptionAttempts: TranscriptionAttemptRepository = {
      recordFailedAttempt: vi.fn(async () => {
        throw new Error("attempt insert failed");
      }),
    };
    vi.mocked(deps.transcriptionClient.transcribe).mockRejectedValueOnce(
      new Error("provider failed"),
    );

    await expect(
      transcribeRecording(
        { doctor: activeDoctor, token: { uid: activeDoctor.firebase_uid } },
        {
          recordingId: recording.id,
          audio: fileInput(),
          requestId: "req-test-123",
        },
        {
          ...deps,
          transcriptionAttempts,
        },
      ),
    ).rejects.toThrow("provider failed");

    expect(transcriptionAttempts.recordFailedAttempt).toHaveBeenCalledOnce();
  });
});
