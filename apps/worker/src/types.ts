import type { Doctor, Recording, TranscriptionLanguage } from "@bharatdoc/shared";

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

export interface RecordingProcessingRepository {
  findRecordingForDoctor(recordingId: string, doctorId: string): Promise<Recording | null>;
  markRecordingTranscribed(input: {
    recordingId: string;
    doctorId: string;
    audioStoragePath: string;
    transcript: string;
  }): Promise<Recording>;
}

export interface AudioStorage {
  uploadRecordingAudio(input: {
    audio: Express.Multer.File;
    clinicId: string;
    doctorId: string;
    recordingId: string;
  }): Promise<string>;
}

export interface TranscriptionClient {
  transcribe(input: {
    audio: Express.Multer.File;
    language: TranscriptionLanguage;
  }): Promise<string>;
}

export interface WorkerDependencies {
  tokenVerifier: FirebaseTokenVerifier;
  doctors: DoctorRepository;
  recordings: RecordingProcessingRepository;
  audioStorage: AudioStorage;
  transcriptionClient: TranscriptionClient;
}

export interface AuthContext {
  doctor: Doctor;
  token: VerifiedFirebaseToken;
}
