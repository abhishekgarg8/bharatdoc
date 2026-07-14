import {
  getProcessingJobRetryDelaySeconds,
  MAX_RECORDING_SECONDS,
  renderSummaryPrompt,
  requirePatientId,
  toProcessingJobStatusDto,
  type ProcessingJobStatusDto,
  type Recording
} from "@bharatdoc/shared";
import { HttpError, sanitizeErrorForTelemetry, toHttpError } from "./http-errors.js";
import { generateRecordingPdf, PDF_STORAGE_RESERVATION_BYTES } from "./pdf-generation.js";
import {
  pdfProcessingInputHash, processingIdempotencyKey, PROVIDER_PROCESSING_TIMEOUT_MS, sha256
} from "./processing.js";
import { summarizeRecording } from "./summary.js";
import {
  MAX_TRANSCRIPTION_UPLOAD_BYTES,
  transcribeRecording,
  type TranscriptionFileInput
} from "./transcription.js";
import type {
  AuthContext,
  ProcessingJobClaim,
  ProcessingJobRepository,
  ProcessingJobStateRepository,
  ProcessingOperation,
  QueuedProcessingJob,
  WorkerDependencies
} from "./types.js";

type QueueDeps = Pick<WorkerDependencies, "clinics" | "recordings" | "processingJobs"> &
  Partial<Pick<WorkerDependencies, "audioStorage" | "logger">>;
type ProcessingEnqueueRepository = ProcessingJobRepository & Pick<ProcessingJobStateRepository, "enqueue">;

export interface EnqueuedProcessingJobResponse {
  job_id: string;
  operation: ProcessingOperation;
  state: QueuedProcessingJob["lifecycleState"];
  job: ProcessingJobStatusDto;
  status_url: string;
}

export interface QueueRunResult {
  claimed: boolean;
  claimed_count?: number;
  recovered: number;
  job_id?: string;
  operation?: ProcessingOperation;
  succeeded?: boolean;
  error_code?: string;
}

export function queueRollout(runtimeEnabled: boolean, requested: Partial<Record<ProcessingOperation, boolean>>) {
  const operations: ProcessingOperation[] = ["transcription", "summary", "pdf"];
  return {
    admission: Object.fromEntries(operations.map((operation) =>
      [operation, runtimeEnabled && requested[operation] === true])) as Record<ProcessingOperation, boolean>,
    drain: runtimeEnabled ? operations : []
  };
}

export function hasProcessingQueue(
  repository: ProcessingJobRepository | undefined
): repository is ProcessingJobStateRepository {
  return Boolean(
    repository &&
      "enqueue" in repository &&
      "activateQueuedTranscriptionArtifact" in repository &&
      "claimReady" in repository &&
      "recoverStale" in repository
  );
}

function requireQueue(repository: ProcessingJobRepository | undefined): ProcessingJobStateRepository {
  if (!hasProcessingQueue(repository)) {
    throw new HttpError(503, "Processing queue is not available.", "PROCESSING_QUEUE_UNAVAILABLE");
  }
  return repository;
}

function requireQueueEnqueue(repository: ProcessingJobRepository | undefined): ProcessingEnqueueRepository {
  if (!repository || typeof (repository as { enqueue?: unknown }).enqueue !== "function") {
    throw new HttpError(503, "Processing queue is not available.", "PROCESSING_QUEUE_UNAVAILABLE");
  }
  return repository as ProcessingEnqueueRepository;
}

function statusFromJob(job: QueuedProcessingJob): ProcessingJobStatusDto {
  return toProcessingJobStatusDto({
    id: job.id,
    operation: job.operation,
    state: job.lifecycleState,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    scheduledAt: job.scheduledAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    nextRetryAt: job.nextRetryAt,
    isStale: job.lifecycleState === "running" && Boolean(job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) <= Date.now()),
    terminalErrorCode: job.terminalErrorCode,
    terminalErrorMessage: job.terminalErrorMessage
  });
}

export function enqueuedResponse(job: QueuedProcessingJob): EnqueuedProcessingJobResponse {
  return {
    job_id: job.id,
    operation: job.operation,
    state: job.lifecycleState,
    job: statusFromJob(job),
    status_url: `/api/processing-jobs/${job.id}`
  };
}

function requireClinicId(clinicId: string | null): string {
  if (!clinicId) throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  return clinicId;
}

function requireRecordingId(recordingId: string | undefined): string {
  const value = recordingId?.trim();
  if (!value) throw new HttpError(400, "Recording ID is required.", "RECORDING_ID_REQUIRED");
  return value;
}

function requireRecording(recording: Recording | null): Recording {
  if (!recording) throw new HttpError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  return recording;
}

function requirePatient(recording: Recording, message: string, code: string): void {
  try {
    requirePatientId(recording.patient_id);
  } catch {
    throw new HttpError(400, message, code);
  }
}

async function pdfInputHash(auth: AuthContext, recording: Recording, deps: QueueDeps): Promise<string> {
  const clinic = await deps.clinics.findClinicById(requireClinicId(auth.doctor.clinic_id));
  if (!clinic) throw new HttpError(404, "Hospital was not found.", "CLINIC_NOT_FOUND");
  return pdfProcessingInputHash({ clinic, doctor: auth.doctor, recording });
}

function requireQueueAudio(audio: TranscriptionFileInput | undefined): TranscriptionFileInput {
  if (!audio?.buffer?.byteLength) throw new HttpError(400, "Audio file is required.", "AUDIO_REQUIRED");
  if (audio.size > MAX_TRANSCRIPTION_UPLOAD_BYTES || audio.buffer.byteLength > MAX_TRANSCRIPTION_UPLOAD_BYTES) {
    throw new HttpError(413, "Audio file exceeds the worker upload size limit.", "AUDIO_TOO_LARGE");
  }
  if (!audio.mimetype.startsWith("audio/")) {
    throw new HttpError(400, "Audio file must be an audio media type.", "AUDIO_TYPE_INVALID");
  }
  return audio;
}

async function matchingStoredAudioPath(
  deps: Pick<WorkerDependencies, "audioStorage" | "recordings">,
  recording: Recording,
  doctorId: string,
  inputHash: string
): Promise<string | null> {
  const path = recording.audio_storage_path ??
    await deps.recordings.findLatestRecordingAudioPath(recording.id, doctorId);
  if (!path) return null;
  try {
    const stored = await deps.audioStorage.downloadRecordingAudio(path);
    return sha256(stored.audio) === inputHash ? path : null;
  } catch {
    return null;
  }
}

async function enqueue(
  auth: AuthContext,
  deps: QueueDeps,
  input: {
    operation: ProcessingOperation;
    recordingId: string;
    idempotencyKey: string;
    inputHash: string;
    transcriptionSeconds?: number;
    storageBytes?: number;
    artifactPath?: string;
  }
): Promise<EnqueuedProcessingJobResponse> {
  const job = await requireQueueEnqueue(deps.processingJobs).enqueue({
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    inputHash: input.inputHash,
    recordingId: input.recordingId,
    doctorId: auth.doctor.id,
    clinicId: requireClinicId(auth.doctor.clinic_id),
    transcriptionSeconds: input.transcriptionSeconds ?? 0,
    storageBytes: input.storageBytes ?? 0,
    ...(input.artifactPath ? { artifactPath: input.artifactPath } : {})
  });
  return enqueuedResponse(job);
}

export async function enqueueSummaryProcessing(
  auth: AuthContext,
  input: { recordingId?: string; idempotencyKey?: string },
  deps: QueueDeps
): Promise<EnqueuedProcessingJobResponse> {
  const recordingId = requireRecordingId(input.recordingId);
  const recording = requireRecording(await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id));
  requirePatient(recording, "Patient ID is required before summary generation.", "PATIENT_ID_REQUIRED");
  if (!recording.transcript?.trim()) {
    throw new HttpError(400, "Transcript is required before summary generation.", "TRANSCRIPT_REQUIRED");
  }
  const inputHash = sha256(renderSummaryPrompt(auth.doctor.custom_prompt, recording.transcript!));
  return enqueue(auth, deps, {
    operation: "summary",
    recordingId,
    inputHash,
    idempotencyKey: input.idempotencyKey?.trim() ||
      processingIdempotencyKey("summary", recordingId, inputHash)
  });
}

export const enqueueSummaryProcessingJob = enqueueSummaryProcessing;

export async function enqueuePdfProcessing(
  auth: AuthContext,
  input: { recordingId?: string; idempotencyKey?: string },
  deps: QueueDeps
): Promise<EnqueuedProcessingJobResponse> {
  const recordingId = requireRecordingId(input.recordingId);
  const recording = requireRecording(await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id));
  requirePatient(recording, "Patient ID is required before PDF generation.", "PATIENT_ID_REQUIRED");
  if (!recording.summary?.trim()) {
    throw new HttpError(400, "Summary is required before PDF generation.", "SUMMARY_REQUIRED");
  }
  const inputHash = await pdfInputHash(auth, recording, deps);
  return enqueue(auth, deps, {
    operation: "pdf",
    recordingId,
    inputHash,
    storageBytes: PDF_STORAGE_RESERVATION_BYTES,
    idempotencyKey: input.idempotencyKey?.trim() ||
      processingIdempotencyKey("pdf", recordingId, inputHash)
  });
}

export const enqueuePdfProcessingJob = enqueuePdfProcessing;

export async function enqueueTranscriptionProcessing(
  auth: AuthContext,
  input: { recordingId?: string; idempotencyKey?: string; audio?: TranscriptionFileInput },
  deps: QueueDeps & Pick<WorkerDependencies, "audioStorage">
): Promise<EnqueuedProcessingJobResponse> {
  const clinicId = requireClinicId(auth.doctor.clinic_id);
  const recordingId = requireRecordingId(input.recordingId);
  const recording = requireRecording(await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id));
  requirePatient(recording, "Patient ID is required before transcription.", "PATIENT_ID_REQUIRED");
  const duration = recording.duration_seconds;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > MAX_RECORDING_SECONDS) {
    throw new HttpError(400, "Recording duration is invalid.", "RECORDING_DURATION_INVALID");
  }

  let audio = input.audio ? requireQueueAudio(input.audio) : null;
  let storedPath: string | null = null;
  if (!audio) {
    storedPath = await deps.recordings.findLatestRecordingAudioPath(recording.id, auth.doctor.id);
    if (!storedPath) {
      throw new HttpError(400, "Original audio is not available on this device or on the server. Record again to transcribe.", "AUDIO_REQUIRED");
    }
    const stored = await deps.audioStorage.downloadRecordingAudio(storedPath);
    audio = requireQueueAudio({
      buffer: stored.audio,
      mimetype: stored.mimeType,
      originalname: stored.filename,
      size: stored.size
    });
  }

  const inputHash = sha256(audio.buffer);
  storedPath ??= await matchingStoredAudioPath(deps, recording, auth.doctor.id, inputHash);
  const artifactPath = storedPath ?? deps.audioStorage.recordingAudioPath?.({
    mimeType: audio.mimetype, clinicId, doctorId: auth.doctor.id, recordingId, artifactKey: inputHash
  }) ?? null;
  if (!artifactPath) {
    throw new HttpError(503, "Deterministic audio storage is unavailable.", "PROCESSING_QUEUE_UNAVAILABLE");
  }
  const response = await enqueue(auth, deps, {
    operation: "transcription", recordingId, inputHash, transcriptionSeconds: duration,
    storageBytes: audio.size, artifactPath,
    idempotencyKey: input.idempotencyKey?.trim() || processingIdempotencyKey("transcription", recordingId, "v1")
  });
  if (response.state !== "queued") return response;

  if (!storedPath) {
    let uploadedPath: string;
    try {
      uploadedPath = await deps.audioStorage.uploadRecordingAudio({
        audio: audio.buffer, mimeType: audio.mimetype, clinicId,
        doctorId: auth.doctor.id, recordingId, filename: audio.originalname, artifactKey: inputHash
      });
    } catch (error) {
      const existing = await deps.audioStorage.downloadRecordingAudio(artifactPath).catch(() => null);
      if (!existing || sha256(existing.audio) !== inputHash) throw error;
      uploadedPath = artifactPath;
    }
    if (uploadedPath !== artifactPath) {
      await deps.audioStorage.deleteRecordingAudio?.(uploadedPath).catch(() => undefined);
      throw new HttpError(409, "Audio storage path did not match its reservation.", "PROCESSING_ARTIFACT_CONFLICT");
    }
  }
  try {
    await requireQueue(deps.processingJobs).activateQueuedTranscriptionArtifact({
      jobId: response.job_id, doctorId: auth.doctor.id, clinicId,
      storagePath: artifactPath, checksum: inputHash
    });
  } catch (error) {
    throw error;
  }
  return response;
}

export const enqueueTranscriptionProcessingJob = enqueueTranscriptionProcessing;

function processingClaim(job: QueuedProcessingJob): ProcessingJobClaim {
  if (!job.leaseToken) {
    throw new HttpError(409, "Processing lease is not available.", "PROCESSING_LEASE_REQUIRED");
  }
  return { disposition: "acquired", job };
}

const terminalQueueErrors = new Set([
  "AUDIO_REQUIRED", "AUDIO_TOO_LARGE", "AUDIO_TYPE_INVALID", "CLINIC_NOT_FOUND",
  "IDEMPOTENCY_KEY_REUSED", "PATIENT_ID_REQUIRED", "PDF_TOO_LARGE",
  "PROCESSING_ARTIFACT_CONFLICT", "PROCESSING_ARTIFACT_INCONSISTENT",
  "PROCESSING_INPUT_CHANGED", "PROCESSING_INPUT_INVALID", "PROCESSING_OUTPUT_REPLACED",
  "PROCESSING_RECORDING_SCOPE_INVALID", "PROCESSING_RECORDING_STATE_INVALID", "PROVIDER_TERMINAL",
  "RECORDING_DURATION_INVALID", "RECORDING_NOT_FOUND", "RECORDING_NOT_TRANSCRIBABLE",
  "SUMMARY_INPUT_INVALID", "SUMMARY_REQUIRED", "TRANSCRIPT_REQUIRED", "TRANSCRIPTION_AUDIO_CHANGED",
  "TRANSCRIPTION_MANIFEST_IMMUTABLE", "TRANSCRIPTION_MANIFEST_INVALID"
]);

function retryableFailure(error: unknown, job: QueuedProcessingJob): boolean {
  const http = toHttpError(error);
  return job.attempt < job.maxAttempts && !terminalQueueErrors.has(http.code);
}

async function transitionQueuedFailure(
  deps: WorkerDependencies,
  job: QueuedProcessingJob,
  error: unknown
): Promise<void> {
  if (!job.leaseToken) return;
  const queue = requireQueue(deps.processingJobs);
  const http = toHttpError(error);
  if (retryableFailure(error, job)) {
    await queue.transition({
      jobId: job.id,
      expectedState: "running",
      nextState: "retry_wait",
      expectedVersion: job.stateVersion,
      leaseToken: job.leaseToken,
      retryAt: new Date(Date.now() + getProcessingJobRetryDelaySeconds(job.attempt) * 1000).toISOString(),
      errorCode: "PROVIDER_RETRYABLE"
    });
    return;
  }
  await queue.transition({
    jobId: job.id,
    expectedState: "running",
    nextState: "failed_terminal",
    expectedVersion: job.stateVersion,
    leaseToken: job.leaseToken,
    errorCode: http.code
  });
}

async function doctorForQueuedJob(deps: WorkerDependencies, job: QueuedProcessingJob) {
  if (!deps.doctors.findById) {
    throw new HttpError(503, "Processing queue doctor lookup is not available.", "PROCESSING_QUEUE_UNAVAILABLE");
  }
  const doctor = await deps.doctors.findById(job.doctorId);
  if (!doctor || doctor.clinic_id !== job.clinicId || doctor.account_status !== "active") {
    throw new HttpError(409, "Queued job doctor is not active.", "PROCESSING_RECORDING_SCOPE_INVALID");
  }
  return doctor;
}

async function validateQueuedJobInput(
  deps: WorkerDependencies,
  job: QueuedProcessingJob,
  auth: AuthContext
): Promise<void> {
  const recording = await deps.recordings.findRecordingForDoctor(job.recordingId, auth.doctor.id);
  if (!recording || recording.clinic_id !== job.clinicId) {
    throw new HttpError(409, "Queued job scope changed.", "PROCESSING_RECORDING_SCOPE_INVALID");
  }
  const currentHash = job.operation === "transcription"
    ? await (async () => {
        const path = recording.audio_storage_path ??
          await deps.recordings.findLatestRecordingAudioPath(recording.id, auth.doctor.id);
        if (!path) return null;
        try { return sha256((await deps.audioStorage.downloadRecordingAudio(path)).audio); }
        catch { return null; }
      })()
    : job.operation === "summary"
    ? recording.transcript?.trim()
      ? sha256(renderSummaryPrompt(auth.doctor.custom_prompt, recording.transcript))
      : null
    : recording.summary?.trim()
      ? await pdfInputHash(auth, recording, deps)
      : null;
  if (currentHash !== job.inputHash) {
    throw new HttpError(409, "Queued processing input changed.", "PROCESSING_INPUT_CHANGED");
  }
}

export async function executeQueuedProcessingJob(
  deps: WorkerDependencies,
  job: QueuedProcessingJob
): Promise<QueueRunResult> {
  try {
    const auth = { doctor: await doctorForQueuedJob(deps, job), token: { uid: `queue:${job.doctorId}` } };
    await validateQueuedJobInput(deps, job, auth);
    const claim = processingClaim(job);
    if (job.operation === "transcription") {
      await transcribeRecording(auth, { recordingId: job.recordingId, idempotencyKey: job.idempotencyKey, processingClaim: claim }, deps);
    } else if (job.operation === "summary") {
      await summarizeRecording(auth, { recordingId: job.recordingId, idempotencyKey: job.idempotencyKey, processingClaim: claim }, deps);
    } else {
      await generateRecordingPdf(auth, { recordingId: job.recordingId, idempotencyKey: job.idempotencyKey,
        processingClaim: claim }, deps);
    }
    return { claimed: true, recovered: 0, job_id: job.id, operation: job.operation, succeeded: true };
  } catch (error) {
    const sanitized = sanitizeErrorForTelemetry(error);
    deps.logger?.error("processing_queue.job_failed", {
      job_id: job.id,
      operation: job.operation,
      ...sanitized
    });
    await transitionQueuedFailure(deps, job, error).catch((transitionError) => {
      deps.logger?.error("processing_queue.transition_failed", {
        job_id: job.id,
        operation: job.operation,
        ...sanitizeErrorForTelemetry(transitionError)
      });
    });
    return {
      claimed: true,
      recovered: 0,
      job_id: job.id,
      operation: job.operation,
      succeeded: false,
      error_code: sanitized.error_code
    };
  }
}

export async function runProcessingQueueOnce(
  deps: WorkerDependencies,
  options: {
    workerId: string;
    operations?: ProcessingOperation[];
    claimLimit?: number;
    recoverLimit?: number;
    now?: Date;
    onQueueHealthy?: () => void;
  }
): Promise<QueueRunResult> {
  const queue = requireQueue(deps.processingJobs);
  const now = options.now ?? new Date();
  const recovered = await queue.recoverStale({
    before: now.toISOString(),
    retryAt: new Date(now.getTime() + 30_000).toISOString(),
    limit: options.recoverLimit ?? 25
  });
  const jobs = await queue.claimReady({
    workerId: options.workerId,
    operations: options.operations ?? ["transcription", "summary", "pdf"],
    limit: options.claimLimit ?? 1
  });
  options.onQueueHealthy?.();
  if (!jobs.length) return { claimed: false, recovered };
  const results = await Promise.all(jobs.map((job) => executeQueuedProcessingJob(deps, job)));
  return {
    ...results[0]!,
    recovered,
    claimed_count: jobs.length,
    succeeded: results.every((result) => result.succeeded)
  };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function runProcessingQueueLoop(
  deps: WorkerDependencies,
  options: {
    workerId: string;
    operations?: ProcessingOperation[];
    pollMs?: number;
    signal?: AbortSignal;
  }
): Promise<void> {
  while (!options.signal?.aborted) {
    const result = await runProcessingQueueOnce(deps, options);
    if (!result.claimed) await wait(options.pollMs ?? 2_000, options.signal);
  }
}

export function startProcessingQueueWorker(
  deps: WorkerDependencies,
  options: {
    workerId: string;
    operations: ProcessingOperation[];
    pollMs?: number;
    batchSize?: number;
    activeHealthMs?: number;
  }
): { stop(): Promise<void>; done: Promise<void>; isReady(): boolean } {
  const controller = new AbortController();
  const pollMs = options.pollMs ?? 2_000;
  let failures = 0;
  let lastSuccess = 0;
  let activeSince = 0;
  let running = true;
  const done = (async () => {
    if (!options.operations.length) return;
    while (!controller.signal.aborted) {
      try {
        activeSince = Date.now();
        const claimed = (await runProcessingQueueOnce(deps, {
          workerId: options.workerId,
          operations: options.operations,
          claimLimit: options.batchSize ?? 1,
          onQueueHealthy: () => {
            failures = 0;
            lastSuccess = Date.now();
          }
        })).claimed;
        activeSince = 0;
        if (!claimed) await wait(pollMs, controller.signal);
      } catch (error) {
        activeSince = 0;
        failures += 1;
        deps.logger?.error("processing_queue.loop_failed", { ...sanitizeErrorForTelemetry(error) });
        const backoff = Math.min(30_000, pollMs * 2 ** Math.min(failures - 1, 5));
        await wait(backoff + Math.floor(Math.random() * Math.min(250, pollMs)), controller.signal);
      }
    }
  })().finally(() => { running = false; });
  return {
    done,
    isReady: () => running && lastSuccess > 0 && failures < 3 && (activeSince > 0
      ? Date.now() - activeSince <= (options.activeHealthMs ?? PROVIDER_PROCESSING_TIMEOUT_MS * 10)
      : Date.now() - lastSuccess <= Math.max(30_000, pollMs * 10)),
    async stop() {
      controller.abort();
      await done;
    }
  };
}
