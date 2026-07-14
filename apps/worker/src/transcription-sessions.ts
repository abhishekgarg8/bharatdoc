import { MAX_AUDIO_BYTES_PHASE_1, MAX_RECORDING_SECONDS } from "@bharatdoc/shared";
import { HttpError, sanitizeErrorForTelemetry } from "./http-errors.js";
import { sha256 } from "./processing.js";
import type {
  AuthContext, TranscriptionSessionChunk, TranscriptionSessionManifest, WorkerDependencies
} from "./types.js";
import type { TranscriptionFileInput } from "./transcription.js";

const MAX_CHUNKS = 120;
const AUDIO_MIME_TYPES = new Set([
  "audio/webm", "audio/ogg", "audio/mp4", "audio/m4a", "audio/aac", "audio/wav", "audio/x-wav"
]);

function clinic(auth: AuthContext): string {
  if (!auth.doctor.clinic_id) throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  return auth.doctor.clinic_id;
}

function required(value: string | undefined, code: string, message: string): string {
  const result = value?.trim();
  if (!result) throw new HttpError(400, message, code);
  return result;
}

function immutable(existing: TranscriptionSessionChunk, input: {
  count: number; bytes: number; durationSeconds: number; mimeType: string; checksum: string;
}): void {
  if (existing.count !== input.count || existing.bytes !== input.bytes ||
      Math.abs(existing.durationSeconds - input.durationSeconds) > 0.001 ||
      existing.mimeType !== input.mimeType || existing.checksum !== input.checksum) {
    throw new HttpError(409, "Chunk index is already bound to different media.", "TRANSCRIPTION_CHUNK_IMMUTABLE");
  }
}

export async function createTranscriptionSession(
  auth: AuthContext,
  input: { recordingId?: string; expectedChunkCount?: number; idempotencyKey?: string },
  deps: Pick<WorkerDependencies, "transcriptionSessions">,
  model: string
): Promise<TranscriptionSessionManifest> {
  if (!deps.transcriptionSessions) throw new HttpError(404, "Chunk sessions are disabled.", "TRANSCRIPTION_SESSIONS_DISABLED");
  const expectedChunkCount = input.expectedChunkCount;
  if (!Number.isInteger(expectedChunkCount) || expectedChunkCount! < 1 || expectedChunkCount! > MAX_CHUNKS) {
    throw new HttpError(400, "Expected chunk count is invalid.", "TRANSCRIPTION_CHUNK_COUNT_INVALID");
  }
  return (await deps.transcriptionSessions.create({
    recordingId: required(input.recordingId, "RECORDING_ID_REQUIRED", "Recording ID is required."),
    doctorId: auth.doctor.id,
    clinicId: clinic(auth),
    expectedChunkCount: expectedChunkCount!,
    language: auth.doctor.transcription_lang,
    model,
    idempotencyKey: required(input.idempotencyKey, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency key is required.")
  })).manifest;
}

export async function uploadTranscriptionChunk(
  auth: AuthContext,
  input: {
    sessionId?: string; index?: number; count?: number; durationSeconds?: number; audio?: TranscriptionFileInput;
  },
  deps: Pick<WorkerDependencies, "transcriptionSessions" | "audioStorage" | "transcriptionClient">
): Promise<{ outcome: "completed" | "in_progress"; chunk: TranscriptionSessionChunk; manifest: TranscriptionSessionManifest }> {
  if (!deps.transcriptionSessions) throw new HttpError(404, "Chunk sessions are disabled.", "TRANSCRIPTION_SESSIONS_DISABLED");
  const sessionId = required(input.sessionId, "TRANSCRIPTION_SESSION_ID_REQUIRED", "Session ID is required.");
  const clinicId = clinic(auth);
  const manifest = await deps.transcriptionSessions.get({ sessionId, doctorId: auth.doctor.id, clinicId });
  if (!manifest) throw new HttpError(404, "Transcription session was not found.", "TRANSCRIPTION_SESSION_NOT_FOUND");
  if (input.count !== manifest.session.expectedChunkCount) {
    throw new HttpError(400, "Chunk count does not match the session.", "TRANSCRIPTION_CHUNK_COUNT_INVALID");
  }
  if (!Number.isInteger(input.index) || input.index! < 0 || input.index! >= input.count) {
    throw new HttpError(400, "Chunk index is invalid.", "TRANSCRIPTION_CHUNK_INDEX_INVALID");
  }
  if (typeof input.durationSeconds !== "number" || !Number.isFinite(input.durationSeconds) ||
      input.durationSeconds <= 0 || input.durationSeconds > MAX_RECORDING_SECONDS) {
    throw new HttpError(400, "Chunk duration is invalid.", "TRANSCRIPTION_CHUNK_DURATION_INVALID");
  }
  const audio = input.audio;
  if (!audio?.buffer.byteLength || audio.size !== audio.buffer.byteLength || audio.size > MAX_AUDIO_BYTES_PHASE_1) {
    throw new HttpError(audio?.size ? 413 : 400, "Chunk audio is invalid.", audio?.size ? "TRANSCRIPTION_CHUNK_TOO_LARGE" : "AUDIO_REQUIRED");
  }
  const mimeType = audio.mimetype.toLowerCase().split(";", 1)[0]!;
  if (!AUDIO_MIME_TYPES.has(mimeType)) {
    throw new HttpError(400, "Chunk must use a supported audio container.", "TRANSCRIPTION_CHUNK_MIME_INVALID");
  }
  const checksum = sha256(audio.buffer);
  const storagePath = deps.audioStorage.transcriptionChunkPath?.({
    mimeType, clinicId, doctorId: auth.doctor.id, recordingId: manifest.session.recordingId,
    sessionId, index: input.index!, checksum
  });
  if (!storagePath || !deps.audioStorage.uploadTranscriptionChunk) {
    throw new HttpError(503, "Chunk storage is unavailable.", "TRANSCRIPTION_CHUNK_STORAGE_UNAVAILABLE");
  }
  const claim = await deps.transcriptionSessions.claimChunk({
    sessionId, doctorId: auth.doctor.id, clinicId, index: input.index!, count: input.count,
    bytes: audio.size, durationSeconds: input.durationSeconds, mimeType, checksum, storagePath
  });
  immutable(claim.chunk, { count: input.count, bytes: audio.size, durationSeconds: input.durationSeconds, mimeType, checksum });
  let upload = claim.disposition === "accepted";
  if (claim.disposition === "existing") {
    if (claim.chunk.state === "completed") return { outcome: "completed", chunk: claim.chunk, manifest: (await deps.transcriptionSessions.get({ sessionId, doctorId: auth.doctor.id, clinicId }))! };
    if (claim.chunk.state === "provider_submitted") return { outcome: "in_progress", chunk: claim.chunk, manifest };
    if (claim.chunk.state === "failed") throw new HttpError(409, "Chunk processing failed and requires reconciliation.", "TRANSCRIPTION_CHUNK_FAILED");
    if (claim.chunk.state === "receiving") {
      let stored: Awaited<ReturnType<typeof deps.audioStorage.downloadRecordingAudio>> | null = null;
      try { stored = await deps.audioStorage.downloadRecordingAudio(storagePath); } catch { upload = true; }
      if (stored && sha256(stored.audio) !== checksum) {
        throw new HttpError(409, "Stored chunk does not match its manifest.", "TRANSCRIPTION_CHUNK_IMMUTABLE");
      }
      if (stored) await deps.transcriptionSessions.markStored({ sessionId, index: input.index!, checksum });
    }
  }
  if (upload) {
    const uploadedPath = await deps.audioStorage.uploadTranscriptionChunk({ audio: audio.buffer, mimeType, storagePath });
    if (uploadedPath !== storagePath) throw new HttpError(500, "Chunk storage path changed.", "TRANSCRIPTION_CHUNK_PATH_MISMATCH");
    await deps.transcriptionSessions.markStored({ sessionId, index: input.index!, checksum });
  }
  const providerRequestKey = `${sessionId}:transcription:${input.index}`;
  if (!await deps.transcriptionSessions.markProviderSubmitted({ sessionId, index: input.index!, providerRequestKey })) {
    const canonical = (await deps.transcriptionSessions.get({ sessionId, doctorId: auth.doctor.id, clinicId }))!;
    return { outcome: "in_progress", chunk: canonical.chunks.find((chunk) => chunk.index === input.index)!, manifest: canonical };
  }
  let transcript: string;
  try {
    transcript = (await deps.transcriptionClient.transcribe({
      audio: audio.buffer, mimeType, filename: audio.originalname,
      language: manifest.session.language, idempotencyKey: providerRequestKey
    })).trim();
  } catch (error) {
    const safe = sanitizeErrorForTelemetry(error);
    try {
      await deps.transcriptionSessions.failChunk({ sessionId, index: input.index!, errorCode: safe.error_code, errorMessage: safe.error_message });
    } catch { /* Preserve provider ambiguity and the original failure. */ }
    throw error;
  }
  if (!transcript) {
    await deps.transcriptionSessions.failChunk({ sessionId, index: input.index!, errorCode: "TRANSCRIPT_EMPTY", errorMessage: "Provider returned no transcript." });
    throw new HttpError(502, "Transcription provider returned an empty response.", "TRANSCRIPT_EMPTY");
  }
  await deps.transcriptionSessions.completeChunk({ sessionId, index: input.index!, transcript });
  const canonical = (await deps.transcriptionSessions.get({ sessionId, doctorId: auth.doctor.id, clinicId }))!;
  return { outcome: "completed", chunk: canonical.chunks.find((chunk) => chunk.index === input.index)!, manifest: canonical };
}
