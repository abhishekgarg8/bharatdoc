import { createHash } from "node:crypto";
import { HttpError } from "./http-errors.js";
import type {
  AudioStorage, PdfStorage, ProcessingJob,
  ProcessingJobClaim,
  ProcessingJobRepository,
  ProcessingOperation
} from "./types.js";

export interface TranscriptionChunkInput {
  index: number;
  count: number;
  bytes: number;
  durationSeconds: number;
  checksum: string;
}

export async function reconcileProcessingArtifacts(
  repository: ProcessingJobRepository,
  storage: { audioStorage?: AudioStorage; pdfStorage?: PdfStorage }
): Promise<number> {
  let deleted = 0;
  const kinds: Array<"audio" | "pdf"> = [];
  if (storage.audioStorage?.deleteRecordingAudio) kinds.push("audio");
  if (storage.pdfStorage?.deleteRecordingPdf) kinds.push("pdf");
  if (!kinds.length) return 0;
  for (const artifact of await repository.claimCleanupArtifacts({ limit: 5, kinds })) {
    try {
      if (artifact.kind === "audio") await storage.audioStorage!.deleteRecordingAudio!(artifact.storagePath);
      else await storage.pdfStorage!.deleteRecordingPdf!(artifact.storagePath);
      await repository.completeArtifactCleanup(artifact);
      deleted += 1;
    } catch {
      await repository.releaseArtifactCleanup(artifact).catch(() => undefined);
    }
  }
  return deleted;
}

export interface TranscriptionManifestLimits {
  expectedBytes: number;
  expectedDurationSeconds: number;
  maxBytes: number;
  maxDurationSeconds: number;
  maxChunks: number;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function processingIdempotencyKey(
  operation: string,
  recordingId: string,
  inputFingerprint: string
): string {
  const normalizedOperation = operation.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 24);
  return `${normalizedOperation}:${recordingId.slice(0, 48)}:${sha256(inputFingerprint).slice(0, 40)}`.slice(0, 120);
}

function invalidManifest(message: string): never {
  throw new HttpError(400, message, "TRANSCRIPTION_MANIFEST_INVALID");
}

export function validateTranscriptionManifest<T extends TranscriptionChunkInput>(
  chunks: T[],
  limits: TranscriptionManifestLimits
): T[] {
  if (!chunks.length || chunks.length > limits.maxChunks) {
    invalidManifest("Transcription chunk count is invalid.");
  }

  let bytes = 0;
  let durationSeconds = 0;
  for (const [index, chunk] of chunks.entries()) {
    if (
      chunk.index !== index ||
      chunk.count !== chunks.length ||
      !Number.isSafeInteger(chunk.bytes) ||
      chunk.bytes <= 0 ||
      !Number.isFinite(chunk.durationSeconds) ||
      chunk.durationSeconds < 0 ||
      !/^[a-f0-9]{64}$/.test(chunk.checksum)
    ) {
      invalidManifest("Transcription chunk metadata is invalid.");
    }
    bytes += chunk.bytes;
    durationSeconds += chunk.durationSeconds;
  }

  if (
    bytes !== limits.expectedBytes ||
    bytes > limits.maxBytes ||
    Math.abs(durationSeconds - limits.expectedDurationSeconds) > 0.01 ||
    durationSeconds > limits.maxDurationSeconds
  ) {
    invalidManifest("Transcription chunk totals are invalid.");
  }

  return chunks;
}

export interface ProcessingClaimInput {
  operation: ProcessingOperation;
  idempotencyKey: string;
  inputHash: string;
  recordingId: string;
  doctorId: string;
  clinicId: string;
  transcriptionSeconds?: number;
  storageBytes?: number;
}

function completed(job: ProcessingJob): ProcessingJobClaim {
  return { disposition: "completed", job };
}

export async function claimProcessingJob(
  repository: ProcessingJobRepository,
  input: ProcessingClaimInput,
  options: { timeoutMs?: number; pollMs?: number } = {}
): Promise<ProcessingJobClaim> {
  let claim = await repository.begin({
    ...input,
    transcriptionSeconds: input.transcriptionSeconds ?? 0,
    storageBytes: input.storageBytes ?? 0
  });
  if (claim.disposition !== "running") {
    return claim;
  }

  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const job = await repository.find(claim.job.id);
    if (job?.state === "completed") {
      return completed(job);
    }
    if (job?.state === "failed") {
      claim = await repository.begin({
        ...input,
        transcriptionSeconds: input.transcriptionSeconds ?? 0,
        storageBytes: input.storageBytes ?? 0
      });
      if (claim.disposition !== "running") {
        return claim;
      }
    }
  }

  throw new HttpError(409, "This recording is already being processed.", "PROCESSING_IN_PROGRESS");
}

export function requireLease(claim: ProcessingJobClaim): { jobId: string; leaseToken: string } {
  const leaseToken = claim.job.leaseToken;
  if (claim.disposition !== "acquired" || !leaseToken) {
    throw new HttpError(409, "Processing lease is not available.", "PROCESSING_LEASE_REQUIRED");
  }
  return { jobId: claim.job.id, leaseToken };
}

export async function withProcessingHeartbeat<T>(
  repository: ProcessingJobRepository,
  lease: { jobId: string; leaseToken: string },
  work: () => Promise<T>
): Promise<T> {
  let heartbeatError: unknown;
  const timer = setInterval(() => {
    void repository.heartbeat(lease).catch((error) => { heartbeatError = error; });
  }, 30_000);
  timer.unref?.();
  try {
    const result = await work();
    if (heartbeatError) throw heartbeatError;
    return result;
  } finally {
    clearInterval(timer);
  }
}
