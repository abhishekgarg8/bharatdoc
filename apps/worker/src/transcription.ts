import { MAX_AUDIO_BYTES_PHASE_1, type Recording } from "@bharatdoc/shared";
import { HttpError } from "./http-errors.js";
import type { AuthContext, WorkerDependencies } from "./types.js";

export interface TranscriptionFileInput {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface TranscribeRecordingInput {
  recordingId?: string;
  audio?: TranscriptionFileInput;
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
    throw new HttpError(403, "Doctor must belong to a clinic.", "CLINIC_REQUIRED");
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

  return recording;
}

export async function transcribeRecording(
  auth: AuthContext,
  input: TranscribeRecordingInput,
  deps: Pick<WorkerDependencies, "recordings" | "audioStorage" | "transcriptionClient">
): Promise<TranscribeRecordingResponse> {
  const clinicId = requireClinicId(auth.doctor.clinic_id);
  const recordingId = requireRecordingId(input.recordingId);
  const audio = requireAudio(input.audio);
  const recording = requireTranscribableRecording(
    await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id)
  );
  const audioStoragePath = await deps.audioStorage.uploadRecordingAudio({
    audio: audio.buffer,
    mimeType: audio.mimetype,
    clinicId,
    doctorId: auth.doctor.id,
    recordingId: recording.id,
    filename: audio.originalname
  });
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
}
