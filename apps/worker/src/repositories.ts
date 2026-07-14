import { TranscriptionSessionFinalizationSchema, type Clinic, type Doctor, type Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudioStorage,
  ClinicRepository,
  DoctorRepository,
  PersistedTranscriptionChunk,
  PdfStorage,
  ProcessingJob,
  ProcessingJobRepository,
  RecordingProcessingRepository,
  TranscriptionAttemptRepository,
  TranscriptionManifest,
  TranscriptionSessionChunk,
  TranscriptionSessionManifest,
  TranscriptionSessionRepository
} from "./types.js";
import { HttpError } from "./http-errors.js";

interface DoctorRow {
  id: string;
  firebase_uid: string;
  clinic_id: string | null;
  role: "owner" | "doctor";
  account_status: "pending_approval" | "active" | "rejected";
  name: string;
  specialization: string;
  phone: string;
  profile_photo_path: string | null;
  custom_prompt: string | null;
  transcription_lang: "auto" | "hi" | "en" | "hien";
  created_at: string;
}

export function createDoctorRepository(supabase: SupabaseClient): DoctorRepository {
  return {
    async findByAuthUid(authUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          [
            "id",
            "firebase_uid",
            "clinic_id",
            "role",
            "account_status",
            "name",
            "specialization",
            "phone",
            "profile_photo_path",
            "custom_prompt",
            "transcription_lang",
            "created_at"
          ].join(",")
        )
        .eq("firebase_uid", authUid)
        .maybeSingle<DoctorRow>();

      if (error) {
        throw error;
      }

      return data;
    }
  };
}

export function createClinicRepository(supabase: SupabaseClient): ClinicRepository {
  return {
    async findClinicById(clinicId: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("id", clinicId).maybeSingle<Clinic>();

      if (error) {
        throw error;
      }

      return data;
    }
  };
}

export function createRecordingProcessingRepository(supabase: SupabaseClient): RecordingProcessingRepository {
  return {
    async findRecordingForDoctor(recordingId: string, doctorId: string): Promise<Recording | null> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*")
        .eq("id", recordingId)
        .eq("doctor_id", doctorId)
        .maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      return data;
    },

    async findLatestRecordingAudioPath(recordingId: string, doctorId: string): Promise<string | null> {
      const { data: recording, error: recordingError } = await supabase
        .from("recordings")
        .select("audio_storage_path")
        .eq("id", recordingId)
        .eq("doctor_id", doctorId)
        .maybeSingle<{ audio_storage_path: string | null }>();

      if (recordingError) {
        throw recordingError;
      }

      if (recording?.audio_storage_path) {
        return recording.audio_storage_path;
      }

      const { data: attempt, error: attemptError } = await supabase
        .from("transcription_attempts")
        .select("audio_storage_path")
        .eq("recording_id", recordingId)
        .eq("doctor_id", doctorId)
        .not("audio_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ audio_storage_path: string | null }>();

      if (attemptError) {
        throw attemptError;
      }

      return attempt?.audio_storage_path ?? null;
    },

    async markRecordingTranscribed(input): Promise<Recording> {
      if (input.processingJobId && input.processingLeaseToken && input.processingInputHash) {
        const { data, error } = await supabase.rpc("complete_transcription_with_processing_lock", {
          p_job_id: input.processingJobId, p_lease_token: input.processingLeaseToken,
          p_recording_id: input.recordingId, p_doctor_id: input.doctorId,
          p_transcript: input.transcript, p_audio_storage_path: input.audioStoragePath,
          p_input_hash: input.processingInputHash
        });
        if (error) throwProcessingError(error);
        return data as Recording;
      }
      const { data, error } = await supabase
        .from("recordings")
        .update({
          audio_storage_path: input.audioStoragePath,
          transcript: input.transcript,
          summary: null,
          pdf_storage_path: null,
          pdf_generated_at: null,
          pdf_version: null,
          status: "transcribed"
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .eq("status", "recorded")
        .select("*")
        .maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new HttpError(
          409,
          "Recording has already been transcribed or finalized.",
          "RECORDING_NOT_TRANSCRIBABLE"
        );
      }

      return data;
    },

    async markRecordingAudioUploaded(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          audio_storage_path: input.audioStoragePath
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .eq("status", "recorded")
        .select("*")
        .maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new HttpError(
          409,
          "Recording has already been transcribed or finalized.",
          "RECORDING_NOT_TRANSCRIBABLE"
        );
      }

      return data;
    },

    async markRecordingSummarized(input): Promise<Recording> {
      if (input.processingJobId && input.processingLeaseToken && input.expectedTranscript !== undefined) {
        const { data, error } = await supabase.rpc("save_generated_summary_with_processing_lock", {
          p_job_id: input.processingJobId,
          p_lease_token: input.processingLeaseToken,
          p_recording_id: input.recordingId,
          p_doctor_id: input.doctorId,
          p_expected_transcript: input.expectedTranscript,
          p_summary: input.summary
        });
        if (error) throwProcessingError(error);
        return data as Recording;
      }
      let query = supabase
        .from("recordings")
        .update({
          summary: input.summary,
          status: "summary_ready",
          pdf_storage_path: null,
          pdf_generated_at: null,
          pdf_version: null
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId);
      if (input.expectedTranscript !== undefined) {
        query = query.eq("transcript", input.expectedTranscript);
      }
      const { data, error } = await query.select("*").maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new HttpError(409, "Transcript changed while the summary was generated.", "PROCESSING_INPUT_CHANGED");
      }
      return data;
    },

    async markRecordingPdfSaved(input): Promise<Recording> {
      if (input.processingJobId && input.processingLeaseToken && input.expectedSummary !== undefined) {
        const { data, error } = await supabase.rpc("save_generated_pdf_with_processing_lock", {
          p_job_id: input.processingJobId, p_lease_token: input.processingLeaseToken,
          p_recording_id: input.recordingId, p_doctor_id: input.doctorId,
          p_expected_summary: input.expectedSummary, p_pdf_storage_path: input.pdfStoragePath,
          p_pdf_generated_at: input.pdfGeneratedAt, p_pdf_version: input.pdfVersion
        });
        if (error) throwProcessingError(error);
        return data as Recording;
      }
      let query = supabase
        .from("recordings")
        .update({
          pdf_storage_path: input.pdfStoragePath,
          pdf_generated_at: input.pdfGeneratedAt,
          pdf_version: input.pdfVersion,
          status: "pdf_saved"
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId);
      if (input.expectedSummary !== undefined) {
        query = query.eq("summary", input.expectedSummary);
      }
      const { data, error } = await query.select("*").maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new HttpError(409, "Summary changed while the PDF was generated.", "PROCESSING_INPUT_CHANGED");
      }
      return data;
    }
  };
}

export function createTranscriptionAttemptRepository(supabase: SupabaseClient): TranscriptionAttemptRepository {
  return {
    async recordFailedAttempt(input): Promise<void> {
      const { error } = await supabase.from("transcription_attempts").insert({
        recording_id: input.recordingId,
        doctor_id: input.doctorId,
        clinic_id: input.clinicId,
        request_id: input.requestId,
        stage: input.stage,
        error_code: input.errorCode,
        error_message: input.errorMessage,
        error_status: input.errorStatus,
        audio_storage_path: input.audioStoragePath ?? null,
        audio_size_bytes: input.audioSizeBytes ?? null,
        audio_mime_type: input.audioMimeType ?? null,
        upstream_status: input.upstreamStatus ?? null,
        upstream_code: input.upstreamCode ?? null,
        upstream_type: input.upstreamType ?? null,
        upstream_message: input.upstreamMessage ?? null,
        upstream_param: input.upstreamParam ?? null
      });

      if (error) {
        throw error;
      }
    }
  };
}

interface ProcessingJobRow {
  id: string;
  operation: ProcessingJob["operation"];
  state: ProcessingJob["state"];
  lease_token: string | null;
  attempt: number;
  result: Record<string, unknown> | null;
  input_hash: string;
  created_at: string;
  disposition?: "acquired" | "running" | "completed";
}

interface TranscriptionManifestJobRow extends ProcessingJobRow {
  recording_key: string;
  doctor_key: string;
  clinic_key: string;
  error_code: string | null;
}

interface TranscriptionChunkRow {
  chunk_index: number;
  expected_count: number;
  byte_size: number;
  duration_seconds: number | string;
  checksum: string;
  storage_path: string;
  state: PersistedTranscriptionChunk["state"];
  transcript: string | null;
  provider_request_key?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

function processingJob(row: ProcessingJobRow): ProcessingJob {
  return {
    id: row.id,
    operation: row.operation,
    state: row.state,
    leaseToken: row.lease_token,
    attempt: row.attempt,
    result: row.result,
    inputHash: row.input_hash,
    createdAt: row.created_at
  };
}

function transcriptionChunk(row: TranscriptionChunkRow): PersistedTranscriptionChunk {
  return {
    index: row.chunk_index,
    count: row.expected_count,
    bytes: row.byte_size,
    durationSeconds: Number(row.duration_seconds),
    checksum: row.checksum,
    storagePath: row.storage_path,
    state: row.state,
    transcript: row.transcript,
    providerRequestKey: row.provider_request_key ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null
  };
}

function transcriptionManifest(job: TranscriptionManifestJobRow, chunks: PersistedTranscriptionChunk[]): TranscriptionManifest {
  const expectedCount = chunks[0]?.count ?? 0;
  const present = new Set(chunks.map((chunk) => chunk.index));
  return {
    job: {
      ...processingJob(job),
      recordingId: job.recording_key,
      doctorId: job.doctor_key,
      clinicId: job.clinic_key,
      errorCode: job.error_code
    },
    chunks,
    missingChunkIndices: Array.from({ length: expectedCount }, (_, index) => index).filter((index) => !present.has(index)),
    failedChunkIndices: chunks.filter((chunk) => chunk.state === "failed").map((chunk) => chunk.index),
    completedChunkIndices: chunks.filter((chunk) => chunk.state === "completed").map((chunk) => chunk.index),
    objectPaths: Array.from(new Set(chunks.map((chunk) => chunk.storagePath)))
  };
}

interface TranscriptionSessionRow {
  id: string; recording_id: string; doctor_id: string; clinic_id: string; expected_chunk_count: number;
  state: TranscriptionSessionManifest["session"]["state"]; language: TranscriptionSessionManifest["session"]["language"];
  mime_type: string | null; model: string; idempotency_key: string; created_at: string; disposition?: "created" | "existing";
}

interface SessionChunkRow {
  chunk_index: number; expected_count: number; byte_size: number; duration_seconds: number | string;
  mime_type: string; checksum: string; storage_path: string; state: TranscriptionSessionChunk["state"];
  transcript: string | null; error_code: string | null; error_message: string | null;
  disposition?: "accepted" | "existing";
}

function sessionChunk(row: SessionChunkRow): TranscriptionSessionChunk {
  return { index: row.chunk_index, count: row.expected_count, bytes: row.byte_size,
    durationSeconds: Number(row.duration_seconds), mimeType: row.mime_type, checksum: row.checksum,
    storagePath: row.storage_path, state: row.state, transcript: row.transcript,
    errorCode: row.error_code, errorMessage: row.error_message };
}

function sessionManifest(row: TranscriptionSessionRow, chunks: TranscriptionSessionChunk[]): TranscriptionSessionManifest {
  const present = new Set(chunks.map((chunk) => chunk.index));
  return { session: { id: row.id, recordingId: row.recording_id, doctorId: row.doctor_id,
      clinicId: row.clinic_id, expectedChunkCount: row.expected_chunk_count, state: row.state,
      mimeType: row.mime_type, language: row.language, model: row.model, idempotencyKey: row.idempotency_key, createdAt: row.created_at },
    chunks, missingChunkIndices: Array.from({ length: row.expected_chunk_count }, (_, index) => index).filter((index) => !present.has(index)),
    failedChunkIndices: chunks.filter((chunk) => chunk.state === "failed").map((chunk) => chunk.index),
    completedChunkIndices: chunks.filter((chunk) => chunk.state === "completed").map((chunk) => chunk.index),
    objectPaths: [...new Set(chunks.map((chunk) => chunk.storagePath))] };
}

function throwProcessingError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const code = [
    "QUOTA_DOCTOR_TRANSCRIPTION_MINUTES", "QUOTA_CLINIC_TRANSCRIPTION_MINUTES",
    "QUOTA_DOCTOR_TRANSCRIPTION", "QUOTA_CLINIC_TRANSCRIPTION",
    "QUOTA_DOCTOR_CONCURRENCY", "QUOTA_CLINIC_CONCURRENCY", "QUOTA_DOCTOR_SUMMARY",
    "QUOTA_CLINIC_SUMMARY", "QUOTA_DOCTOR_PDF", "QUOTA_CLINIC_PDF",
    "QUOTA_DOCTOR_STORAGE", "QUOTA_CLINIC_STORAGE", "QUOTA_PROCESSING_RETRIES"
  ].find((value) => message.includes(value));
  if (code) {
    throw new HttpError(429, "AI processing quota exceeded. Try again later.", code);
  }
  if (message.includes("TRANSCRIPTION_MANIFEST_INVALID")) {
    throw new HttpError(400, "Transcription chunk manifest is invalid.", "TRANSCRIPTION_MANIFEST_INVALID");
  }
  if (message.includes("TRANSCRIPTION_SESSION_NOT_FOUND")) {
    throw new HttpError(404, "Transcription session was not found.", "TRANSCRIPTION_SESSION_NOT_FOUND");
  }
  const invalid = [
    "PROCESSING_INPUT_INVALID", "PROCESSING_RECORDING_SCOPE_INVALID", "PROCESSING_DURATION_INVALID",
    "TRANSCRIPTION_CHUNK_STATE_INVALID", "PROCESSING_ARTIFACT_INVALID", "TRANSCRIPTION_SESSION_INVALID",
    "TRANSCRIPTION_CHUNK_INVALID", "TRANSCRIPTION_CHUNK_LIMIT_EXCEEDED"
  ].find((value) => message.includes(value));
  if (invalid) {
    throw new HttpError(400, "AI processing request is invalid.", invalid);
  }
  const conflict = [
    "IDEMPOTENCY_KEY_REUSED", "TRANSCRIPTION_MANIFEST_IMMUTABLE", "PROCESSING_LEASE_LOST",
    "PROCESSING_RECORDING_BUSY", "PROCESSING_RECORDING_STATE_INVALID", "PROCESSING_INPUT_CHANGED",
    "TRANSCRIPTION_MANIFEST_INCOMPLETE", "PROCESSING_ARTIFACT_CONFLICT",
    "PROCESSING_ARTIFACT_CLEANUP_BUSY", "RECORDING_NOT_TRANSCRIBABLE",
    "TRANSCRIPTION_SESSION_IMMUTABLE", "TRANSCRIPTION_SESSION_ACTIVE", "TRANSCRIPTION_CHUNK_IMMUTABLE",
    "TRANSCRIPTION_SESSION_NOT_FINALIZABLE", "TRANSCRIPTION_FINALIZATION_IMMUTABLE",
    "TRANSCRIPTION_FINALIZATION_KEY_REUSED", "TRANSCRIPTION_FINALIZATION_ARTIFACT_INVALID"
  ]
    .find((value) => message.includes(value));
  if (conflict) {
    throw new HttpError(409, "AI processing request conflicts with existing work.", conflict);
  }
  throw error;
}

export function createProcessingJobRepository(supabase: SupabaseClient): ProcessingJobRepository {
  return {
    async begin(input) {
      const { data, error } = await supabase.rpc("claim_recording_processing_job", {
        p_operation: input.operation,
        p_idempotency_key: input.idempotencyKey,
        p_input_hash: input.inputHash,
        p_recording_id: input.recordingId,
        p_doctor_id: input.doctorId,
        p_clinic_id: input.clinicId,
        p_transcription_seconds: input.transcriptionSeconds,
        p_storage_bytes: input.storageBytes
      });
      if (error) throwProcessingError(error);
      const row = (data as ProcessingJobRow[] | null)?.[0];
      if (!row?.disposition) throw new Error("Processing claim returned no row.");
      return { disposition: row.disposition, job: processingJob(row) };
    },

    async find(jobId) {
      const { data, error } = await supabase.from("recording_processing_jobs")
        .select("id,operation,state,lease_token,attempt,result,input_hash,created_at").eq("id", jobId).maybeSingle<ProcessingJobRow>();
      if (error) throw error;
      return data ? processingJob(data) : null;
    },

    async findByIdempotencyKey(input) {
      const { data, error } = await supabase.from("recording_processing_jobs")
        .select("id,operation,state,lease_token,attempt,result,input_hash,created_at")
        .eq("operation", input.operation).eq("doctor_key", input.doctorId)
        .eq("idempotency_key", input.idempotencyKey).maybeSingle<ProcessingJobRow>();
      if (error) throw error;
      return data ? processingJob(data) : null;
    },

    async findByLogicalInput(input) {
      let query = supabase.from("recording_processing_jobs")
        .select("id,operation,state,lease_token,attempt,result,input_hash,created_at")
        .eq("operation", input.operation).eq("recording_key", input.recordingId)
        .order("created_at", { ascending: false }).limit(1);
      if (input.inputHash) query = query.eq("input_hash", input.inputHash);
      const { data, error } = await query.maybeSingle<ProcessingJobRow>();
      if (error) throw error;
      return data ? processingJob(data) : null;
    },

    async heartbeat(input) {
      const { error } = await supabase.rpc("heartbeat_recording_processing_job", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken
      });
      if (error) throwProcessingError(error);
    },

    async saveTranscriptionManifest(input) {
      const { data, error } = await supabase.rpc("save_transcription_chunk_manifest", {
        p_job_id: input.jobId,
        p_lease_token: input.leaseToken,
        p_recording_id: input.recordingId,
        p_chunks: input.chunks
      });
      if (error) throwProcessingError(error);
      return ((data ?? []) as TranscriptionChunkRow[]).map(transcriptionChunk);
    },

    async markProviderSubmitted(input) {
      const { error } = await supabase.rpc("mark_processing_provider_submitted", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken,
        p_provider_request_key: input.providerRequestKey, p_chunk_index: input.chunkIndex ?? null
      });
      if (error) throwProcessingError(error);
    },

    async markTranscriptionChunkCompleted(input) {
      const { error } = await supabase.rpc("complete_transcription_chunk", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken,
        p_chunk_index: input.index, p_transcript: input.transcript
      });
      if (error) throwProcessingError(error);
    },

    async markTranscriptionChunkFailed(input) {
      const { error } = await supabase.rpc("fail_transcription_chunk", {
        p_job_id: input.jobId,
        p_lease_token: input.leaseToken,
        p_chunk_index: input.index,
        p_error_code: input.errorCode,
        p_error_message: input.errorMessage
      });
      if (error) throwProcessingError(error);
    },

    async getTranscriptionManifest(input) {
      const { data: job, error: jobError } = await supabase
        .from("recording_processing_jobs")
        .select([
          "id", "operation", "state", "lease_token", "attempt", "result", "input_hash",
          "created_at", "recording_key", "doctor_key", "clinic_key", "error_code"
        ].join(","))
        .eq("id", input.jobId)
        .eq("operation", "transcription")
        .eq("doctor_key", input.doctorId)
        .eq("clinic_key", input.clinicId)
        .maybeSingle<TranscriptionManifestJobRow>();
      if (jobError) throw jobError;
      if (!job) return null;

      const { data: chunks, error: chunksError } = await supabase
        .from("transcription_chunks")
        .select([
          "chunk_index", "expected_count", "byte_size", "duration_seconds", "checksum",
          "storage_path", "state", "transcript", "provider_request_key", "error_code", "error_message"
        ].join(","))
        .eq("job_id", input.jobId)
        .order("chunk_index", { ascending: true });
      if (chunksError) throw chunksError;
      return transcriptionManifest(job, ((chunks ?? []) as unknown as TranscriptionChunkRow[]).map(transcriptionChunk));
    },

    async recordProviderCall(input) {
      const { error } = await supabase.rpc("record_processing_provider_call", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken, p_provider: input.provider,
        p_latency_ms: input.latencyMs, p_estimated_cost_usd: input.estimatedCostUsd
      });
      if (error) throwProcessingError(error);
    },

    async recordArtifact(input) {
      const { error } = await supabase.rpc("record_processing_artifact", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken,
        p_kind: input.kind, p_storage_path: input.storagePath, p_byte_size: input.byteSize,
        p_checksum: input.checksum, p_state: input.state ?? "pending"
      });
      if (error) throwProcessingError(error);
    },

    async findArtifact(input) {
      const { data, error } = await supabase.from("processing_artifacts")
        .select("storage_path,state").eq("job_id", input.jobId).eq("kind", input.kind)
        .eq("checksum", input.checksum).in("state", ["pending", "current", "superseded", "orphaned"])
        .order("created_at", { ascending: false }).limit(1)
        .maybeSingle<{ storage_path: string; state: "pending" | "current" | "superseded" | "orphaned" }>();
      if (error) throw error;
      return data ? { storagePath: data.storage_path, state: data.state } : null;
    },

    async markArtifactReady(input) {
      const { error } = await supabase.rpc("mark_processing_artifact_ready", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken, p_storage_path: input.storagePath
      });
      if (error) throwProcessingError(error);
    },

    async supersedeArtifacts(input) {
      const { data, error } = await supabase.rpc("supersede_processing_artifacts", {
        p_recording_id: input.recordingId, p_kind: input.kind, p_keep_storage_path: input.keepStoragePath
      });
      if (error) throwProcessingError(error);
      return ((data ?? []) as Array<{ storage_path: string }>).map((row) => row.storage_path);
    },

    async markArtifactOrphaned(storagePath) {
      const { error } = await supabase.rpc("mark_processing_artifact_orphaned", { p_storage_path: storagePath });
      if (error) throwProcessingError(error);
    },

    async claimCleanupArtifacts(input) {
      const { data, error } = await supabase.rpc("claim_processing_artifact_cleanup", {
        p_limit: input.limit, p_kinds: input.kinds
      });
      if (error) throwProcessingError(error);
      return ((data ?? []) as Array<{ kind: "audio" | "pdf"; storage_path: string; cleanup_token: string }>)
        .map((row) => ({ kind: row.kind, storagePath: row.storage_path, cleanupToken: row.cleanup_token }));
    },

    async completeArtifactCleanup(input) {
      const { error } = await supabase.rpc("complete_processing_artifact_cleanup", {
        p_storage_path: input.storagePath, p_cleanup_token: input.cleanupToken
      });
      if (error) throwProcessingError(error);
    },

    async releaseArtifactCleanup(input) {
      const { error } = await supabase.rpc("release_processing_artifact_cleanup", {
        p_storage_path: input.storagePath, p_cleanup_token: input.cleanupToken
      });
      if (error) throwProcessingError(error);
    },

    async invalidateCompleted(input) {
      const { error } = await supabase.rpc("invalidate_completed_processing_job", {
        p_job_id: input.jobId, p_input_hash: input.inputHash, p_error_code: input.errorCode
      });
      if (error) throwProcessingError(error);
    },

    async complete(input) {
      const { error } = await supabase.rpc("complete_recording_processing_job", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken, p_result: input.result
      });
      if (error) throwProcessingError(error);
    },

    async fail(input) {
      const { error } = await supabase.rpc("fail_recording_processing_job", {
        p_job_id: input.jobId, p_lease_token: input.leaseToken, p_error_code: input.errorCode
      });
      if (error) throwProcessingError(error);
    }
  };
}

export function createTranscriptionSessionRepository(supabase: SupabaseClient): TranscriptionSessionRepository {
  const get = async (input: { sessionId: string; doctorId: string; clinicId: string }) => {
    const { data: session, error } = await supabase.from("transcription_sessions")
      .select("id,recording_id,doctor_id,clinic_id,expected_chunk_count,state,mime_type,language,model,idempotency_key,created_at")
      .eq("id", input.sessionId).eq("doctor_id", input.doctorId).eq("clinic_id", input.clinicId)
      .maybeSingle<TranscriptionSessionRow>();
    if (error) throw error;
    if (!session) return null;
    const { data: rows, error: chunkError } = await supabase.from("transcription_chunks")
      .select("chunk_index,expected_count,byte_size,duration_seconds,mime_type,checksum,storage_path,state,transcript,error_code,error_message")
      .eq("session_id", input.sessionId).order("chunk_index", { ascending: true });
    if (chunkError) throw chunkError;
    return sessionManifest(session, ((rows ?? []) as unknown as SessionChunkRow[]).map(sessionChunk));
  };
  return {
    async create(input) {
      const { data, error } = await supabase.rpc("create_transcription_session", {
        p_recording_id: input.recordingId, p_doctor_id: input.doctorId, p_clinic_id: input.clinicId,
        p_expected_chunk_count: input.expectedChunkCount, p_language: input.language,
        p_model: input.model, p_idempotency_key: input.idempotencyKey
      });
      if (error) throwProcessingError(error);
      const row = (data as TranscriptionSessionRow[] | null)?.[0];
      if (!row?.disposition) throw new Error("Session creation returned no row.");
      const manifest = row.disposition === "existing"
        ? await get({ sessionId: row.id, doctorId: input.doctorId, clinicId: input.clinicId })
        : sessionManifest(row, []);
      if (!manifest) throw new Error("Existing session was not readable.");
      return { disposition: row.disposition, manifest };
    },
    get,
    async claimChunk(input) {
      const { data, error } = await supabase.rpc("claim_transcription_session_chunk", {
        p_session_id: input.sessionId, p_doctor_id: input.doctorId, p_clinic_id: input.clinicId,
        p_chunk_index: input.index, p_expected_count: input.count, p_byte_size: input.bytes,
        p_duration_seconds: input.durationSeconds, p_mime_type: input.mimeType,
        p_checksum: input.checksum, p_storage_path: input.storagePath
      });
      if (error) throwProcessingError(error);
      const row = (data as SessionChunkRow[] | null)?.[0];
      if (!row?.disposition) throw new Error("Chunk claim returned no row.");
      return { disposition: row.disposition, chunk: sessionChunk(row) };
    },
    async markStored(input) {
      const { error } = await supabase.rpc("mark_transcription_session_chunk_stored", {
        p_session_id: input.sessionId, p_chunk_index: input.index, p_checksum: input.checksum
      });
      if (error) throwProcessingError(error);
    },
    async markProviderSubmitted(input) {
      const { data, error } = await supabase.rpc("submit_transcription_session_chunk", {
        p_session_id: input.sessionId, p_chunk_index: input.index, p_provider_request_key: input.providerRequestKey
      });
      if (error) throwProcessingError(error);
      return data === true;
    },
    async completeChunk(input) {
      const { error } = await supabase.rpc("complete_transcription_session_chunk", {
        p_session_id: input.sessionId, p_chunk_index: input.index, p_transcript: input.transcript
      });
      if (error) throwProcessingError(error);
    },
    async failChunk(input) {
      const { error } = await supabase.rpc("fail_transcription_session_chunk", {
        p_session_id: input.sessionId, p_chunk_index: input.index,
        p_error_code: input.errorCode, p_error_message: input.errorMessage
      });
      if (error) throwProcessingError(error);
    },
    async finalize(input) {
      const { data, error } = await supabase.rpc("finalize_transcription_session", {
        p_session_id: input.sessionId, p_doctor_id: input.doctorId,
        p_clinic_id: input.clinicId, p_idempotency_key: input.idempotencyKey
      });
      if (error) throwProcessingError(error);
      return TranscriptionSessionFinalizationSchema.parse(data);
    }
  };
}

export function createSupabaseAudioStorage(supabase: SupabaseClient): AudioStorage {
  const pathFor = (input: { mimeType: string; clinicId: string; doctorId: string; recordingId: string; artifactKey: string }) => {
    const normalizedMimeType = input.mimeType.toLowerCase();
    const extension = normalizedMimeType.includes("mp4") || normalizedMimeType.includes("m4a") || normalizedMimeType.includes("aac")
      ? "m4a" : normalizedMimeType.includes("wav") || normalizedMimeType.includes("wave") ? "wav" : "webm";
    const artifact = input.artifactKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    return [input.clinicId, input.doctorId, `${input.recordingId}-${artifact}.${extension}`].join("/");
  };
  return {
    recordingAudioPath: pathFor,
    transcriptionChunkPath(input) {
      const extension = input.mimeType.includes("mp4") || input.mimeType.includes("m4a") || input.mimeType.includes("aac")
        ? "m4a" : input.mimeType.includes("wav") ? "wav" : input.mimeType.includes("ogg") ? "ogg" : "webm";
      return [input.clinicId, input.doctorId, input.recordingId, "sessions", input.sessionId, "chunks",
        `${String(input.index).padStart(4, "0")}-${input.checksum}.${extension}`].join("/");
    },
    async uploadTranscriptionChunk(input): Promise<string> {
      const { error } = await supabase.storage.from("audio").upload(input.storagePath, input.audio, {
        contentType: input.mimeType, upsert: false
      });
      if (error) throw error;
      return input.storagePath;
    },
    async uploadRecordingAudio(input): Promise<string> {
      const artifact = input.artifactKey?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || String(Date.now());
      const path = pathFor({ ...input, artifactKey: artifact });
      const { error } = await supabase.storage.from("audio").upload(path, input.audio, {
        contentType: input.mimeType,
        upsert: false
      });

      if (error) {
        throw error;
      }

      return path;
    },
    async deleteRecordingAudio(path): Promise<void> {
      const { error } = await supabase.storage.from("audio").remove([path]);
      if (error) throw error;
    },

    async downloadRecordingAudio(path: string): Promise<{ audio: Buffer; mimeType: string; filename: string; size: number }> {
      const { data, error } = await supabase.storage.from("audio").download(path);

      if (error) {
        throw error;
      }

      const arrayBuffer = await data.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const filename = path.split("/").filter(Boolean).at(-1) ?? "recording";
      const normalizedPath = path.toLowerCase();
      const mimeType =
        data.type ||
        (normalizedPath.endsWith(".wav") || normalizedPath.endsWith(".wave")
          ? "audio/wav"
          : normalizedPath.endsWith(".m4a") || normalizedPath.endsWith(".mp4") || normalizedPath.endsWith(".aac")
            ? "audio/mp4"
            : "audio/webm");

      return {
        audio,
        mimeType,
        filename,
        size: audio.byteLength
      };
    }
  };
}

export function createSupabasePdfStorage(supabase: SupabaseClient): PdfStorage {
  const pathFor = (input: { clinicId: string; doctorId: string; recordingId: string; artifactKey: string }) => {
    const artifact = input.artifactKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
    return [input.clinicId, input.doctorId, `${input.recordingId}-${artifact}.pdf`].join("/");
  };
  return {
    recordingPdfPath: pathFor,
    async uploadRecordingPdf(input): Promise<string> {
      const artifact = input.artifactKey?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || String(Date.now());
      const path = pathFor({ ...input, artifactKey: artifact });
      const { error } = await supabase.storage.from("pdfs").upload(path, input.pdf, {
        contentType: "application/pdf",
        upsert: false
      });

      if (error) {
        throw error;
      }

      return path;
    },

    async deleteRecordingPdf(path): Promise<void> {
      const { error } = await supabase.storage.from("pdfs").remove([path]);
      if (error) throw error;
    },

    async downloadRecordingPdf(path): Promise<Buffer> {
      const { data, error } = await supabase.storage.from("pdfs").download(path);
      if (error) throw error;
      return Buffer.from(await data.arrayBuffer());
    },

    async createSignedUrl(path: string): Promise<string> {
      const { data, error } = await supabase.storage.from("pdfs").createSignedUrl(path, 30 * 60);

      if (error) {
        throw error;
      }

      return data.signedUrl;
    }
  };
}
