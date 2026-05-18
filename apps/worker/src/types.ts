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
  }): Promise<Recording>;
  markRecordingPdfSaved(input: {
    recordingId: string;
    doctorId: string;
    pdfStoragePath: string;
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
  }): Promise<string>;
}

export interface TranscriptionClient {
  transcribe(input: {
    audio: Buffer;
    mimeType: string;
    filename: string;
    language: Doctor["transcription_lang"];
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
  }): Promise<string>;
  createSignedUrl(path: string): Promise<string>;
}

export interface AudioStorage {
  uploadRecordingAudio(input: {
    audio: Buffer;
    mimeType: string;
    clinicId: string;
    doctorId: string;
    recordingId: string;
    filename: string;
  }): Promise<string>;
  downloadRecordingAudio(path: string): Promise<{
    audio: Buffer;
    mimeType: string;
    filename: string;
    size: number;
  }>;
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
  logger?: StructuredLogger;
}

export interface AuthContext {
  doctor: Doctor;
  token: VerifiedAuthToken;
}
