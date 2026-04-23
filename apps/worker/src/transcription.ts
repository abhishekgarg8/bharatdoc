import { requirePatientId, type Recording, type TranscriptionLanguage } from "@bharatdoc/shared";
import type { AuthContext, WorkerDependencies } from "./types.js";
import { HttpError } from "./http-errors.js";

export const MAX_TRANSCRIPTION_AUDIO_BYTES = 25 * 1024 * 1024;

export interface TranscriptionRequestInput {
  audio?: Express.Multer.File;
  recordingId?: string;
}

export interface TranscriptionResponse {
  recording_id: string;
  transcript: string;
}

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

function requireAudio(audio: Express.Multer.File | undefined): Express.Multer.File {
  if (!audio || audio.size <= 0) {
    throw new HttpError(400, "Audio file is required.", "AUDIO_REQUIRED");
  }

  if (audio.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    throw new HttpError(413, "Audio file exceeds the 25MB Phase 1 limit.", "AUDIO_TOO_LARGE");
  }

  return audio;
}

function requireTranscribableRecording(recording: Recording | null): Recording {
  if (!recording) {
    throw new HttpError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  try {
    requirePatientId(recording.patient_id);
  } catch {
    throw new HttpError(400, "Patient ID is required before transcription.", "PATIENT_ID_REQUIRED");
  }

  return recording;
}

export function transcriptionLanguageHint(language: TranscriptionLanguage): "hi" | "en" | undefined {
  if (language === "hi" || language === "en") {
    return language;
  }

  return undefined;
}

export async function transcribeUploadedRecording(
  auth: AuthContext,
  input: TranscriptionRequestInput,
  deps: Pick<WorkerDependencies, "audioStorage" | "recordings" | "transcriptionClient">
): Promise<TranscriptionResponse> {
  const clinicId = requireClinicId(auth.doctor.clinic_id);
  const recordingId = requireRecordingId(input.recordingId);
  const audio = requireAudio(input.audio);
  const recording = requireTranscribableRecording(
    await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id)
  );
  const audioStoragePath = await deps.audioStorage.uploadRecordingAudio({
    audio,
    clinicId,
    doctorId: auth.doctor.id,
    recordingId: recording.id
  });
  const transcript = await deps.transcriptionClient.transcribe({
    audio,
    language: auth.doctor.transcription_lang
  });

  await deps.recordings.markRecordingTranscribed({
    recordingId: recording.id,
    doctorId: auth.doctor.id,
    audioStoragePath,
    transcript
  });

  return {
    recording_id: recording.id,
    transcript
  };
}
