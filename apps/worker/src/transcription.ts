import { MAX_AUDIO_BYTES_PHASE_1, requirePatientId, type Recording } from "@bharatdoc/shared";
import { HttpError, sanitizeErrorForTelemetry } from "./http-errors.js";
import type { AuthContext, TranscriptionAttemptStage, WorkerDependencies } from "./types.js";

export interface TranscriptionFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface TranscribeRecordingInput {
  recordingId?: string;
  audio?: TranscriptionFileInput;
  requestId?: string;
}

export interface TranscribeRecordingResponse {
  recording_id: string;
  transcript: string;
  audio_storage_path: string;
  status: "transcribed";
}

export const MAX_TRANSCRIPTION_AUDIO_BYTES = MAX_AUDIO_BYTES_PHASE_1;

function requireClinicId(clinicId: string | null): string {
  if (!clinicId) {
    throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  }

  return clinicId;
}

function requireRecordingId(recordingId: string | undefined): string {
  const trimmed = recordingId?.trim();

  if (!trimmed) {
    throw new HttpError(400, "Recording ID is required.", "RECORDING_ID_REQUIRED");
  }

  return trimmed;
}

function requireAudio(audio: TranscriptionFileInput | undefined): TranscriptionFileInput {
  if (!audio?.buffer?.byteLength) {
    throw new HttpError(400, "Audio file is required.", "AUDIO_REQUIRED");
  }

  if (audio.size > MAX_TRANSCRIPTION_AUDIO_BYTES || audio.buffer.byteLength > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    throw new HttpError(413, "Audio file exceeds the Phase 1 size limit.", "AUDIO_TOO_LARGE");
  }

  if (!audio.mimetype.startsWith("audio/")) {
    throw new HttpError(400, "Audio file must be an audio media type.", "AUDIO_TYPE_INVALID");
  }

  return audio;
}

function requireTranscribableRecording(recording: Recording | null): Recording {
  if (!recording) {
    throw new HttpError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  if (recording.status !== "recorded") {
    throw new HttpError(
      409,
      "Recording has already been transcribed or finalized.",
      "RECORDING_NOT_TRANSCRIBABLE"
    );
  }

  return recording;
}

function requireTranscriptionPatientId(recording: Recording): void {
  try {
    requirePatientId(recording.patient_id);
  } catch {
    throw new HttpError(400, "Patient ID is required before transcription.", "PATIENT_ID_REQUIRED");
  }
}

export async function transcribeRecording(
  auth: AuthContext,
  input: TranscribeRecordingInput,
  deps: Pick<WorkerDependencies, "recordings" | "audioStorage" | "transcriptionClient" | "transcriptionAttempts" | "logger">
): Promise<TranscribeRecordingResponse> {
  let stage: TranscriptionAttemptStage = "validate_input";
  let recordingId: string | null = input.recordingId?.trim() || null;
  let audioStoragePath: string | null = null;

  try {
    const clinicId = requireClinicId(auth.doctor.clinic_id);
    const requiredRecordingId = requireRecordingId(input.recordingId);
    recordingId = requiredRecordingId;
    const audio = requireAudio(input.audio);

    stage = "load_recording";
    const recording = requireTranscribableRecording(
      await deps.recordings.findRecordingForDoctor(requiredRecordingId, auth.doctor.id)
    );

    stage = "validate_recording";
    requireTranscriptionPatientId(recording);

    stage = "upload_audio";
    audioStoragePath = await deps.audioStorage.uploadRecordingAudio({
      audio: audio.buffer,
      mimeType: audio.mimetype,
      clinicId,
      doctorId: auth.doctor.id,
      recordingId: recording.id,
      filename: audio.originalname
    });
    deps.logger?.info("transcription.audio_uploaded", {
      request_id: input.requestId,
      recording_id: recording.id,
      doctor_id: auth.doctor.id,
      clinic_id: clinicId,
      stage,
      audio_size_bytes: audio.size,
      audio_mime_type: audio.mimetype,
      audio_storage_path: audioStoragePath
    });

    stage = "transcribe_audio";
    const transcript = (
      await deps.transcriptionClient.transcribe({
        audio: audio.buffer,
        mimeType: audio.mimetype,
        filename: audio.originalname,
        language: auth.doctor.transcription_lang
      })
    ).trim();

    if (!transcript) {
      throw new HttpError(502, "Transcription provider returned an empty response.", "TRANSCRIPT_EMPTY");
    }

    stage = "save_transcript";
    await deps.recordings.markRecordingTranscribed({
      recordingId: recording.id,
      doctorId: auth.doctor.id,
      transcript,
      audioStoragePath
    });

    return {
      recording_id: recording.id,
      transcript,
      audio_storage_path: audioStoragePath,
      status: "transcribed"
    };
  } catch (error) {
    const sanitizedError = sanitizeErrorForTelemetry(error);

    deps.logger?.error("transcription.pipeline.failed", {
      request_id: input.requestId,
      recording_id: recordingId,
      doctor_id: auth.doctor.id,
      clinic_id: auth.doctor.clinic_id,
      stage,
      audio_storage_path: audioStoragePath,
      ...sanitizedError
    });

    if (input.requestId && recordingId && deps.transcriptionAttempts) {
      try {
        await deps.transcriptionAttempts.recordFailedAttempt({
          recordingId,
          doctorId: auth.doctor.id,
          clinicId: auth.doctor.clinic_id,
          requestId: input.requestId,
          stage,
          errorCode: sanitizedError.error_code,
          errorMessage: sanitizedError.error_message,
          errorStatus: sanitizedError.error_status,
          audioStoragePath
        });
      } catch (attemptError) {
        deps.logger?.error("transcription.attempt_persist_failed", {
          request_id: input.requestId,
          recording_id: recordingId,
          doctor_id: auth.doctor.id,
          clinic_id: auth.doctor.clinic_id,
          stage,
          ...sanitizeErrorForTelemetry(attemptError)
        });
      }
    }

    throw error;
  }
}
