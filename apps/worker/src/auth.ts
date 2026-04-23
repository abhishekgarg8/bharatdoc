import { AccessError, assertActiveDoctor, assertClinicScope, assertOwner, type Doctor } from "@bharatdoc/shared";
import type { Request } from "express";
import { HttpError } from "./http-errors.js";
import type { AuthContext, WorkerDependencies } from "./types.js";

export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new AccessError("Authorization bearer token is required.", "AUTH_REQUIRED");
  }

  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new AccessError("Authorization bearer token is malformed.", "AUTH_REQUIRED");
  }

  return match[1].trim();
}

export async function authenticateRequest(req: Request, deps: WorkerDependencies): Promise<AuthContext> {
  const bearerToken = extractBearerToken(req.header("authorization"));
  const token = await deps.tokenVerifier.verifyIdToken(bearerToken);
  const doctor = await deps.doctors.findByFirebaseUid(token.uid);

  return {
    doctor: assertActiveDoctor(doctor),
    token
  };
}

export async function requireOwner(req: Request, deps: WorkerDependencies): Promise<AuthContext> {
  const auth = await authenticateRequest(req, deps);
  assertOwner(auth.doctor);
  return auth;
}

export function requireClinicScope(doctor: Doctor, clinicId: string): Doctor {
  return assertClinicScope(doctor, clinicId);
}

export function mapFirebaseAuthError(error: unknown): never {
  if (error instanceof Error) {
    throw new HttpError(401, "Firebase token verification failed.", "AUTH_REQUIRED");
  }

  throw error;
}
