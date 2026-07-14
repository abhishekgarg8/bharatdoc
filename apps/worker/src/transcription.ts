import { MAX_AUDIO_BYTES_PHASE_1, MAX_RECORDING_SECONDS, requirePatientId, type Recording } from "@bharatdoc/shared";
import { HttpError, sanitizeErrorForTelemetry, toHttpError } from "./http-errors.js";
import {
  claimProcessingJob, processingIdempotencyKey, reconcileProcessingArtifacts,
  PROVIDER_PROCESSING_TIMEOUT_MS, requireLease, runWithProcessingDeadline, sha256, validateTranscriptionManifest,
  withProcessingHeartbeat
} from "./processing.js";
import type { AuthContext, ProcessingJobClaim, TranscriptionAttemptStage, WorkerDependencies } from "./types.js";

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
  idempotencyKey?: string;
  processingClaim?: ProcessingJobClaim;
}

export interface TranscribeRecordingResponse {
  recording_id: string;
  transcript: string;
  audio_storage_path: string;
  status: "transcribed";
}

export const MAX_TRANSCRIPTION_AUDIO_BYTES = MAX_AUDIO_BYTES_PHASE_1;
export const MAX_TRANSCRIPTION_UPLOAD_BYTES = MAX_TRANSCRIPTION_AUDIO_BYTES * 8;

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

  if (audio.size > MAX_TRANSCRIPTION_UPLOAD_BYTES || audio.buffer.byteLength > MAX_TRANSCRIPTION_UPLOAD_BYTES) {
    throw new HttpError(413, "Audio file exceeds the worker upload size limit.", "AUDIO_TOO_LARGE");
  }

  if (!audio.mimetype.startsWith("audio/")) {
    throw new HttpError(400, "Audio file must be an audio media type.", "AUDIO_TYPE_INVALID");
  }

  return audio;
}

function requireDownloadedAudio(input: {
  audio: Buffer;
  mimeType: string;
  filename: string;
  size: number;
}): TranscriptionFileInput {
  return requireAudio({
    buffer: input.audio,
    mimetype: input.mimeType,
    originalname: input.filename,
    size: input.size,
  });
}

function filenameForPart(filename: string, partIndex: number, partCount: number): string {
  if (partCount === 1) {
    return filename;
  }

  const match = /^(.*?)(\.[^.]*)?$/.exec(filename);
  const basename = match?.[1] || "recording";
  const extension = match?.[2] || "";

  return `${basename}.part-${String(partIndex + 1).padStart(2, "0")}-of-${String(partCount).padStart(2, "0")}${extension}`;
}

function audioParts(audio: TranscriptionFileInput): Array<{ buffer: Buffer; filename: string }> {
  if (audio.buffer.byteLength <= MAX_TRANSCRIPTION_AUDIO_BYTES) {
    return [{ buffer: audio.buffer, filename: audio.originalname }];
  }

  const partCount = Math.ceil(audio.buffer.byteLength / MAX_TRANSCRIPTION_AUDIO_BYTES);

  return Array.from({ length: partCount }, (_, index) => {
    const start = index * MAX_TRANSCRIPTION_AUDIO_BYTES;
    const end = Math.min(start + MAX_TRANSCRIPTION_AUDIO_BYTES, audio.buffer.byteLength);

    return {
      buffer: audio.buffer.subarray(start, end),
      filename: filenameForPart(audio.originalname, index, partCount)
    };
  });
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
  deps: Pick<WorkerDependencies, "recordings" | "audioStorage" | "transcriptionClient"> &
    Partial<Pick<WorkerDependencies, "transcriptionAttempts" | "processingJobs" | "logger">>
): Promise<TranscribeRecordingResponse> {
  let stage: TranscriptionAttemptStage = "validate_input";
  let recordingId: string | null = input.recordingId?.trim() || null;
  let audioStoragePath: string | null = null;
  let audioSizeBytes: number | null = null;
  let audioMimeType: string | null = null;
  let lease: { jobId: string; leaseToken: string } | null = null;
  let activeChunkIndex: number | null = null;

  try {
    const clinicId = requireClinicId(auth.doctor.clinic_id);
    if (deps.processingJobs) {
      await reconcileProcessingArtifacts(deps.processingJobs, { audioStorage: deps.audioStorage });
    }
    const requiredRecordingId = requireRecordingId(input.recordingId);
    recordingId = requiredRecordingId;
    stage = "load_recording";
    let recording = await deps.recordings.findRecordingForDoctor(requiredRecordingId, auth.doctor.id);
    if (!recording) {
      throw new HttpError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
    }

    stage = "validate_recording";
    requireTranscriptionPatientId(recording);
    const idempotencyKey = input.idempotencyKey?.trim() ||
      processingIdempotencyKey("transcription", recording.id, "v1");
    const keyJob = input.processingClaim?.job ?? (deps.processingJobs
      ? await deps.processingJobs.findByIdempotencyKey({
          operation: "transcription", doctorId: auth.doctor.id, idempotencyKey
        })
      : null);
    let audio = input.audio ? requireAudio(input.audio) : undefined;
    let inputHash = audio ? sha256(audio.buffer) : keyJob?.inputHash;
    if (audio && keyJob && keyJob.inputHash !== inputHash) {
      throw new HttpError(409, "Idempotency key was already used for different audio.", "IDEMPOTENCY_KEY_REUSED");
    }
    const logicalJob = deps.processingJobs
      ? await deps.processingJobs.findByLogicalInput({
          operation: "transcription", recordingId: recording.id, ...(inputHash ? { inputHash } : {})
        })
      : null;
    const priorJob = keyJob ?? logicalJob;
    inputHash ??= priorJob?.inputHash;

    if (recording.status !== "recorded") {
      if (priorJob?.state === "completed" && recording.transcript && recording.audio_storage_path) {
        return {
          recording_id: recording.id, transcript: recording.transcript,
          audio_storage_path: recording.audio_storage_path, status: "transcribed"
        };
      }
      requireTranscribableRecording(recording);
    }

    if (!audio && !inputHash) {
      stage = "download_audio";
      audioStoragePath = await deps.recordings.findLatestRecordingAudioPath(recording.id, auth.doctor.id);

      if (!audioStoragePath) {
        throw new HttpError(
          400,
          "Original audio is not available on this device or on the server. Record again to transcribe.",
          "AUDIO_REQUIRED"
        );
      }

      const downloadedAudio = await deps.audioStorage.downloadRecordingAudio(audioStoragePath);
      audio = requireDownloadedAudio(downloadedAudio);
      inputHash = sha256(audio.buffer);
      audioSizeBytes = audio.size;
      audioMimeType = audio.mimetype;

      deps.logger?.info("transcription.audio_downloaded", {
        request_id: input.requestId,
        recording_id: recording.id,
        doctor_id: auth.doctor.id,
        clinic_id: clinicId,
        stage,
        audio_size_bytes: audio.size,
        audio_mime_type: audio.mimetype,
        audio_storage_path: audioStoragePath
      });
    }

    if (!inputHash) {
      throw new HttpError(400, "Audio file is required.", "AUDIO_REQUIRED");
    }
    const duration = recording.duration_seconds;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > MAX_RECORDING_SECONDS) {
      throw new HttpError(400, "Recording duration is invalid.", "RECORDING_DURATION_INVALID");
    }
    const claim = input.processingClaim ?? (deps.processingJobs
      ? await claimProcessingJob(deps.processingJobs, {
          operation: "transcription", idempotencyKey, inputHash, recordingId: recording.id,
          doctorId: auth.doctor.id, clinicId, transcriptionSeconds: duration,
          storageBytes: audio?.size ?? 0
        })
      : null);
    if (claim?.disposition === "completed") {
      recording = await deps.recordings.findRecordingForDoctor(recording.id, auth.doctor.id);
      if (!recording?.transcript || !recording.audio_storage_path) {
        throw new HttpError(409, "Completed transcription result is unavailable.", "PROCESSING_RESULT_MISSING");
      }
      return {
        recording_id: recording.id, transcript: recording.transcript,
        audio_storage_path: recording.audio_storage_path, status: "transcribed"
      };
    }
    lease = claim ? requireLease(claim) : null;

    if (!audio) {
      stage = "download_audio";
      audioStoragePath = await deps.recordings.findLatestRecordingAudioPath(recording.id, auth.doctor.id);
      if (!audioStoragePath) {
        throw new HttpError(400, "Original audio is not available on this device or on the server. Record again to transcribe.", "AUDIO_REQUIRED");
      }
      audio = requireDownloadedAudio(await deps.audioStorage.downloadRecordingAudio(audioStoragePath));
      if (sha256(audio.buffer) !== inputHash) {
        throw new HttpError(409, "Stored audio no longer matches the processing manifest.", "TRANSCRIPTION_AUDIO_CHANGED");
      }
    } else if (recording.audio_storage_path && lease) {
      const stored = requireDownloadedAudio(await deps.audioStorage.downloadRecordingAudio(recording.audio_storage_path));
      if (sha256(stored.buffer) === inputHash) {
        audio = stored;
        audioStoragePath = recording.audio_storage_path;
      }
    }
    audioSizeBytes = audio.size;
    audioMimeType = audio.mimetype;

    const knownArtifact = lease && deps.processingJobs
      ? await deps.processingJobs.findArtifact({ jobId: lease.jobId, kind: "audio", checksum: inputHash })
      : null;
    if (lease && !audioStoragePath && knownArtifact && knownArtifact.state !== "deleted") {
      try {
        const stored = requireDownloadedAudio(await deps.audioStorage.downloadRecordingAudio(knownArtifact.storagePath));
        if (sha256(stored.buffer) === inputHash) {
          audio = stored;
          audioStoragePath = knownArtifact.storagePath;
          await deps.processingJobs!.markArtifactReady({ ...lease, storagePath: audioStoragePath });
        }
      } catch {
        // A pending intent with no object is safe to upload to the same deterministic path.
      }
    }
    if (lease && deps.processingJobs && audioStoragePath && !knownArtifact) {
      await deps.processingJobs.recordArtifact({
        ...lease, kind: "audio", storagePath: audioStoragePath,
        byteSize: audio.buffer.byteLength, checksum: inputHash, state: "current"
      });
    }
    if (!audioStoragePath) {
      stage = "upload_audio";
      const intendedPath = lease
        ? deps.audioStorage.recordingAudioPath?.({
            mimeType: audio.mimetype, clinicId, doctorId: auth.doctor.id,
            recordingId: recording.id, artifactKey: inputHash
          }) ?? null
        : null;
      if (lease && deps.processingJobs && intendedPath) {
        await deps.processingJobs.recordArtifact({
          ...lease, kind: "audio", storagePath: intendedPath,
          byteSize: audio.buffer.byteLength, checksum: inputHash, state: "pending"
        });
      }
      audioStoragePath = await deps.audioStorage.uploadRecordingAudio({
        audio: audio.buffer, mimeType: audio.mimetype, clinicId, doctorId: auth.doctor.id,
        recordingId: recording.id, filename: audio.originalname,
        ...(lease ? { artifactKey: inputHash } : {})
      });
      if (lease && deps.processingJobs) {
        if (intendedPath) {
          await deps.processingJobs.markArtifactReady({ ...lease, storagePath: audioStoragePath });
        } else {
          await deps.processingJobs.recordArtifact({
            ...lease, kind: "audio", storagePath: audioStoragePath,
            byteSize: audio.buffer.byteLength, checksum: inputHash, state: "current"
          });
        }
      }
      await deps.recordings.markRecordingAudioUploaded({
        recordingId: recording.id, doctorId: auth.doctor.id, audioStoragePath
      });
      deps.logger?.info("transcription.audio_uploaded", {
        request_id: input.requestId, recording_id: recording.id, doctor_id: auth.doctor.id,
        clinic_id: clinicId, stage, audio_size_bytes: audio.size, audio_mime_type: audio.mimetype
      });
    }

    stage = "transcribe_audio";
    const parts = audioParts(audio);
    let allocatedDuration = 0;
    const manifest = parts.map((part, index) => {
      const durationSeconds = index === parts.length - 1
        ? duration - allocatedDuration
        : Number(((duration * part.buffer.byteLength) / audio.buffer.byteLength).toFixed(3));
      allocatedDuration += durationSeconds;
      return {
        index, count: parts.length, bytes: part.buffer.byteLength, durationSeconds,
        checksum: sha256(part.buffer), storagePath: audioStoragePath!
      };
    });
    validateTranscriptionManifest(manifest, {
      expectedBytes: audio.buffer.byteLength, expectedDurationSeconds: duration,
      maxBytes: MAX_TRANSCRIPTION_UPLOAD_BYTES, maxDurationSeconds: MAX_RECORDING_SECONDS, maxChunks: 8
    });
    const persistedChunks = lease && deps.processingJobs
      ? await deps.processingJobs.saveTranscriptionManifest({
          ...lease, recordingId: recording.id, chunks: manifest
        })
      : [];
    const transcriptParts: string[] = [];

    for (const [index, part] of parts.entries()) {
      const persisted = persistedChunks[index];
      if (persisted?.state === "completed") {
        if (persisted.transcript) transcriptParts.push(persisted.transcript);
        continue;
      }
      const providerRequestKey = lease ? `${lease.jobId}:transcription:${index}` : undefined;
      if (lease && deps.processingJobs) {
        await deps.processingJobs.markProviderSubmitted({
          ...lease, providerRequestKey: providerRequestKey!, chunkIndex: index
        });
      }
      activeChunkIndex = index;
      const startedAt = Date.now();
      const providerWork = () => runWithProcessingDeadline((signal) => deps.transcriptionClient.transcribe({
          audio: part.buffer,
          mimeType: audio.mimetype,
          filename: part.filename,
          language: auth.doctor.transcription_lang,
          ...(providerRequestKey ? { idempotencyKey: providerRequestKey } : {}), signal
        }), PROVIDER_PROCESSING_TIMEOUT_MS);
      const transcriptPart = (
        lease && deps.processingJobs
          ? await withProcessingHeartbeat(deps.processingJobs, lease, providerWork)
          : await providerWork()
      ).trim();

      if (lease && deps.processingJobs) {
        await deps.processingJobs.recordProviderCall({
          ...lease, provider: "openai", latencyMs: Date.now() - startedAt,
          estimatedCostUsd: (manifest[index]!.durationSeconds / 60) * 0.003
        });
        await deps.processingJobs.markTranscriptionChunkCompleted({
          ...lease, index, transcript: transcriptPart
        });
      }
      activeChunkIndex = null;

      if (transcriptPart) {
        transcriptParts.push(transcriptPart);
      }
    }

    const transcript = transcriptParts.join("\n\n").trim();

    if (!transcript) {
      throw new HttpError(502, "Transcription provider returned an empty response.", "TRANSCRIPT_EMPTY");
    }

    stage = "save_transcript";
    await deps.recordings.markRecordingTranscribed({
      recordingId: recording.id,
      doctorId: auth.doctor.id,
      transcript,
      audioStoragePath,
      ...(lease ? {
        processingJobId: lease.jobId, processingLeaseToken: lease.leaseToken,
        processingInputHash: inputHash
      } : {})
    });
    if (lease && deps.processingJobs) {
      await deps.processingJobs.supersedeArtifacts({
        recordingId: recording.id, kind: "audio", keepStoragePath: audioStoragePath
      });
      await reconcileProcessingArtifacts(deps.processingJobs, { audioStorage: deps.audioStorage });
    }

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

    if (lease && deps.processingJobs) {
      try {
        if (activeChunkIndex !== null) {
          await deps.processingJobs.markTranscriptionChunkFailed({
            ...lease,
            index: activeChunkIndex,
            errorCode: sanitizedError.error_code,
            errorMessage: sanitizedError.error_message
          });
        }
        if (!input.processingClaim) {
          await deps.processingJobs.fail({ ...lease, errorCode: toHttpError(error).code });
        }
      } catch {
        // A lost lease must not mask the operation error.
      }
    }

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
          audioStoragePath,
          audioSizeBytes,
          audioMimeType,
          upstreamStatus: sanitizedError.upstream_status ?? null,
          upstreamCode: sanitizedError.upstream_code ?? null,
          upstreamType: sanitizedError.upstream_type ?? null,
          upstreamMessage: sanitizedError.upstream_message ?? null,
          upstreamParam: sanitizedError.upstream_param ?? null
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
