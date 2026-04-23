import type { Doctor } from "@bharatdoc/shared";

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

export interface WorkerDependencies {
  tokenVerifier: FirebaseTokenVerifier;
  doctors: DoctorRepository;
}

export interface AuthContext {
  doctor: Doctor;
  token: VerifiedFirebaseToken;
}
