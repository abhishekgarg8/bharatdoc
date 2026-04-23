import type { Clinic, Doctor, Recording, RecordingStatus } from "@bharatdoc/shared";

export interface VerifiedFirebaseToken {
  uid: string;
  phone_number?: string;
}

export interface FirebaseTokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedFirebaseToken>;
}

export interface DoctorRepository {
  findByFirebaseUid(firebaseUid: string): Promise<Doctor | null>;
}

export interface ClinicRepository {
  findClinicById(clinicId: string): Promise<Clinic | null>;
}

export interface RecordingProcessingRepository {
  findRecordingForDoctor(recordingId: string, doctorId: string): Promise<Recording | null>;
  markRecordingTranscribed(input: {
    recordingId: string;
    doctorId: string;
    transcript: string;
    audioStoragePath: string;
  }): Promise<Recording>;
  markRecordingSummarized(input: {
    recordingId: string;
    doctorId: string;
    summary: string;
    status: Extract<RecordingStatus, "summary_ready" | "pdf_saved">;
  }): Promise<Recording>;
  markRecordingPdfSaved(input: {
    recordingId: string;
    doctorId: string;
    pdfStoragePath: string;
  }): Promise<Recording>;
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
}

export interface WorkerDependencies {
  tokenVerifier: FirebaseTokenVerifier;
  doctors: DoctorRepository;
  clinics: ClinicRepository;
  recordings: RecordingProcessingRepository;
  transcriptionClient: TranscriptionClient;
  summaryClient: SummaryClient;
  audioStorage: AudioStorage;
  pdfRenderer: PdfRenderer;
  pdfStorage: PdfStorage;
}

export interface AuthContext {
  doctor: Doctor;
  token: VerifiedFirebaseToken;
}
