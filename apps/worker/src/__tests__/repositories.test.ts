import { describe, expect, it, vi } from "vitest";
import type { Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createRecordingProcessingRepository,
  createTranscriptionAttemptRepository,
} from "../repositories.js";

const transcribedRecording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: "11111111-1111-4111-8111-111111111111",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/new.webm",
  transcript: "Updated transcript.",
  summary: null,
  pdf_storage_path: null,
  status: "transcribed",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z",
};

function supabaseFor(result: { data: Recording | null; error: Error | null }) {
  const query: {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };

  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient,
  };
}

function supabaseForInsert(result: { error: Error | null }) {
  const query = {
    insert: vi.fn(async () => result),
  };

  return {
    query,
    supabase: {
      from: vi.fn(() => query),
    } as unknown as SupabaseClient,
  };
}

describe("createRecordingProcessingRepository", () => {
  it("marks only recorded rows transcribed and clears stale derived artifacts", async () => {
    const { supabase, query } = supabaseFor({
      data: transcribedRecording,
      error: null,
    });
    const repository = createRecordingProcessingRepository(supabase);

    await expect(
      repository.markRecordingTranscribed({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        transcript: "Updated transcript.",
        audioStoragePath: "clinic/doctor/new.webm",
      }),
    ).resolves.toEqual(transcribedRecording);

    expect(supabase.from).toHaveBeenCalledWith("recordings");
    expect(query.update).toHaveBeenCalledWith({
      audio_storage_path: "clinic/doctor/new.webm",
      transcript: "Updated transcript.",
      summary: null,
      pdf_storage_path: null,
      status: "transcribed",
    });
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", transcribedRecording.id);
    expect(query.eq).toHaveBeenNthCalledWith(
      2,
      "doctor_id",
      transcribedRecording.doctor_id,
    );
    expect(query.eq).toHaveBeenNthCalledWith(3, "status", "recorded");
  });

  it("rejects stale transcribe writes when the row is no longer recorded", async () => {
    const { supabase } = supabaseFor({ data: null, error: null });
    const repository = createRecordingProcessingRepository(supabase);

    await expect(
      repository.markRecordingTranscribed({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        transcript: "Updated transcript.",
        audioStoragePath: "clinic/doctor/new.webm",
      }),
    ).rejects.toMatchObject({ code: "RECORDING_NOT_TRANSCRIBABLE" });
  });
});

describe("createTranscriptionAttemptRepository", () => {
  it("persists failed transcription attempt metadata without transcript content", async () => {
    const { supabase, query } = supabaseForInsert({ error: null });
    const repository = createTranscriptionAttemptRepository(supabase);

    await expect(
      repository.recordFailedAttempt({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        clinicId: transcribedRecording.clinic_id,
        requestId: "req-test-123",
        stage: "transcribe_audio",
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Internal server error.",
        errorStatus: 500,
        audioStoragePath: "clinic/doctor/new.webm",
      }),
    ).resolves.toBeUndefined();

    expect(supabase.from).toHaveBeenCalledWith("transcription_attempts");
    expect(query.insert).toHaveBeenCalledWith({
      recording_id: transcribedRecording.id,
      doctor_id: transcribedRecording.doctor_id,
      clinic_id: transcribedRecording.clinic_id,
      request_id: "req-test-123",
      stage: "transcribe_audio",
      error_code: "INTERNAL_ERROR",
      error_message: "Internal server error.",
      error_status: 500,
      audio_storage_path: "clinic/doctor/new.webm",
    });
  });

  it("surfaces failed attempt insert errors to the caller", async () => {
    const { supabase } = supabaseForInsert({
      error: new Error("insert failed"),
    });
    const repository = createTranscriptionAttemptRepository(supabase);

    await expect(
      repository.recordFailedAttempt({
        recordingId: transcribedRecording.id,
        doctorId: transcribedRecording.doctor_id,
        clinicId: transcribedRecording.clinic_id,
        requestId: "req-test-123",
        stage: "transcribe_audio",
        errorCode: "INTERNAL_ERROR",
        errorMessage: "Internal server error.",
        errorStatus: 500,
      }),
    ).rejects.toThrow("insert failed");
  });
});
