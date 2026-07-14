import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import type { StructuredLogger } from "./logger.js";

export type TranscriptionAttemptStage =
  | "validate_input"
  | "load_recording"
  | "validate_recording"
  | "upload_audio"
  | "download_audio"
  | "transcribe_audio"
  | "save_transcript";

export interface VerifiedAuthToken {
  uid: string;
  email?: string;
}

export interface AuthTokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedAuthToken>;
}

export interface DoctorRepository {
  findByAuthUid(authUid: string): Promise<Doctor | null>;
}

export interface ClinicRepository {
  findClinicById(clinicId: string): Promise<Clinic | null>;
}

export interface RecordingProcessingRepository {
  findRecordingForDoctor(recordingId: string, doctorId: string): Promise<Recording | null>;
  findLatestRecordingAudioPath(recordingId: string, doctorId: string): Promise<string | null>;
  markRecordingTranscribed(input: {
    recordingId: string;
    doctorId: string;
    transcript: string;
    audioStoragePath: string;
    expectedStatus?: "recorded";
    processingJobId?: string;
    processingLeaseToken?: string;
    processingInputHash?: string;
  }): Promise<Recording>;
  markRecordingAudioUploaded(input: {
    recordingId: string;
    doctorId: string;
    audioStoragePath: string;
  }): Promise<Recording>;
  markRecordingSummarized(input: {
    recordingId: string;
    doctorId: string;
    summary: string;
    expectedTranscript?: string;
    processingJobId?: string;
    processingLeaseToken?: string;
  }): Promise<Recording>;
  markRecordingPdfSaved(input: {
    recordingId: string;
    doctorId: string;
    pdfStoragePath: string;
    pdfGeneratedAt: string;
    pdfVersion: string;
    expectedSummary?: string;
    processingJobId?: string;
    processingLeaseToken?: string;
  }): Promise<Recording>;
}

export interface TranscriptionAttemptRepository {
  recordFailedAttempt(input: {
    recordingId: string;
    doctorId: string;
    clinicId: string | null;
    requestId: string;
    stage: TranscriptionAttemptStage;
    errorCode: string;
    errorMessage: string;
    errorStatus: number;
    audioStoragePath?: string | null;
    audioSizeBytes?: number | null;
    audioMimeType?: string | null;
    upstreamStatus?: number | null;
    upstreamCode?: string | null;
    upstreamType?: string | null;
    upstreamMessage?: string | null;
    upstreamParam?: string | null;
  }): Promise<void>;
}

export interface SummaryClient {
  summarize(input: {
    prompt: string;
    recording: Recording;
    doctor: Doctor;
    idempotencyKey?: string;
  }): Promise<string>;
}

export interface TranscriptionClient {
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    filename: string;
    language: Doctor["transcription_lang"];
    idempotencyKey?: string;
  }): Promise<string>;
}

export interface PdfRenderer {
  render(input: {
    clinic: Clinic;
    doctor: Doctor;
    recording: Recording;
    generatedAt: Date;
  }): Promise<Buffer>;
}

export interface PdfStorage {
  uploadRecordingPdf(input: {
    pdf: Buffer;
    clinicId: string;
    doctorId: string;
    recordingId: string;
    artifactKey?: string;
  }): Promise<string>;
  createSignedUrl(path: string): Promise<string>;
  deleteRecordingPdf?(path: string): Promise<void>;
  downloadRecordingPdf?(path: string): Promise<Buffer>;
  recordingPdfPath?(input: { clinicId: string; doctorId: string; recordingId: string; artifactKey: string }): string;
}

export interface AudioStorage {
  uploadRecordingAudio(input: {
    audio: Buffer;
    mimeType: string;
    clinicId: string;
    doctorId: string;
    recordingId: string;
    filename: string;
    artifactKey?: string;
  }): Promise<string>;
  downloadRecordingAudio(path: string): Promise<{
    audio: Buffer;
    mimeType: string;
    filename: string;
    size: number;
  }>;
  deleteRecordingAudio?(path: string): Promise<void>;
  recordingAudioPath?(input: {
    mimeType: string; clinicId: string; doctorId: string; recordingId: string; artifactKey: string;
  }): string;
}

export type ProcessingOperation = "transcription" | "summary" | "pdf";
export type ProcessingJobState = "running" | "completed" | "failed";

export interface ProcessingJob {
  id: string;
  operation: ProcessingOperation;
  state: ProcessingJobState;
  leaseToken: string | null;
  attempt: number;
  result: Record<string, unknown> | null;
  inputHash: string;
  createdAt: string;
}

export interface ProcessingJobClaim {
  disposition: "acquired" | "running" | "completed";
  job: ProcessingJob;
}

export interface PersistedTranscriptionChunk {
  index: number;
  count: number;
  bytes: number;
  durationSeconds: number;
  checksum: string;
  storagePath: string;
  state: "pending" | "provider_submitted" | "completed" | "failed";
  transcript: string | null;
  providerRequestKey: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface TranscriptionManifest {
  job: ProcessingJob & {
    recordingId: string;
    doctorId: string;
    clinicId: string;
    errorCode: string | null;
  };
  chunks: PersistedTranscriptionChunk[];
  missingChunkIndices: number[];
  failedChunkIndices: number[];
  completedChunkIndices: number[];
  objectPaths: string[];
}

export interface ProcessingJobRepository {
  begin(input: {
    operation: ProcessingOperation;
    idempotencyKey: string;
    inputHash: string;
    recordingId: string;
    doctorId: string;
    clinicId: string;
    transcriptionSeconds: number;
    storageBytes: number;
  }): Promise<ProcessingJobClaim>;
  find(jobId: string): Promise<ProcessingJob | null>;
  findByIdempotencyKey(input: {
    operation: ProcessingOperation;
    doctorId: string;
    idempotencyKey: string;
  }): Promise<ProcessingJob | null>;
  findByLogicalInput(input: {
    operation: ProcessingOperation;
    recordingId: string;
    inputHash?: string;
  }): Promise<ProcessingJob | null>;
  heartbeat(input: { jobId: string; leaseToken: string }): Promise<void>;
  saveTranscriptionManifest(input: {
    jobId: string;
    leaseToken: string;
    recordingId: string;
    chunks: Array<{
      index: number;
      count: number;
      bytes: number;
      durationSeconds: number;
      checksum: string;
      storagePath: string;
    }>;
  }): Promise<PersistedTranscriptionChunk[]>;
  markTranscriptionChunkCompleted(input: {
    jobId: string;
    leaseToken: string;
    index: number;
    transcript: string;
  }): Promise<void>;
  markTranscriptionChunkFailed(input: {
    jobId: string;
    leaseToken: string;
    index: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
  getTranscriptionManifest(input: {
    jobId: string;
    doctorId: string;
    clinicId: string;
  }): Promise<TranscriptionManifest | null>;
  markProviderSubmitted(input: {
    jobId: string;
    leaseToken: string;
    providerRequestKey: string;
    chunkIndex?: number;
  }): Promise<void>;
  recordProviderCall(input: {
    jobId: string;
    leaseToken: string;
    provider: string;
    latencyMs: number;
    estimatedCostUsd: number;
  }): Promise<void>;
  recordArtifact(input: {
    jobId: string;
    leaseToken: string;
    kind: "audio" | "pdf";
    storagePath: string;
    byteSize: number;
    checksum: string;
    state?: "pending" | "current";
  }): Promise<void>;
  findArtifact(input: {
    jobId: string;
    kind: "audio" | "pdf";
    checksum: string;
  }): Promise<{ storagePath: string; state: "pending" | "current" | "superseded" | "orphaned" | "deleted" } | null>;
  markArtifactReady(input: { jobId: string; leaseToken: string; storagePath: string }): Promise<void>;
  supersedeArtifacts(input: {
    recordingId: string;
    kind: "audio" | "pdf";
    keepStoragePath: string;
  }): Promise<string[]>;
  markArtifactOrphaned(storagePath: string): Promise<void>;
  claimCleanupArtifacts(input: { limit: number; kinds: Array<"audio" | "pdf"> }): Promise<Array<{
    kind: "audio" | "pdf";
    storagePath: string;
    cleanupToken: string;
  }>>;
  completeArtifactCleanup(input: { storagePath: string; cleanupToken: string }): Promise<void>;
  releaseArtifactCleanup(input: { storagePath: string; cleanupToken: string }): Promise<void>;
  invalidateCompleted(input: { jobId: string; inputHash: string; errorCode: string }): Promise<void>;
  complete(input: {
    jobId: string;
    leaseToken: string;
    result: Record<string, unknown>;
  }): Promise<void>;
  fail(input: {
    jobId: string;
    leaseToken: string;
    errorCode: string;
  }): Promise<void>;
}

export interface WorkerDependencies {
  tokenVerifier: AuthTokenVerifier;
  doctors: DoctorRepository;
  clinics: ClinicRepository;
  recordings: RecordingProcessingRepository;
  transcriptionAttempts?: TranscriptionAttemptRepository;
  transcriptionClient: TranscriptionClient;
  summaryClient: SummaryClient;
  audioStorage: AudioStorage;
  pdfRenderer: PdfRenderer;
  pdfStorage: PdfStorage;
  processingJobs?: ProcessingJobRepository;
  logger?: StructuredLogger;
}

export interface AuthContext {
  doctor: Doctor;
  token: VerifiedAuthToken;
}
