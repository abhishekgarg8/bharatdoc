import {
  AccessError,
  assertActiveDoctor,
  assertClinicScope,
  assertOwner,
  type Doctor,
} from "@bharatdoc/shared";
import type { Request, RequestHandler, Response } from "express";
import { HttpError } from "./http-errors.js";
import type { AuthContext, WorkerDependencies } from "./types.js";

export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new AccessError(
      "Authorization bearer token is required.",
      "AUTH_REQUIRED",
    );
  }

  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match?.[1]) {
    throw new AccessError(
      "Authorization bearer token is malformed.",
      "AUTH_REQUIRED",
    );
  }

  return match[1].trim();
}

export async function authenticateRequest(
  req: Request,
  deps: WorkerDependencies,
): Promise<AuthContext> {
  const bearerToken = extractBearerToken(req.header("authorization"));
  let token: AuthContext["token"];

  try {
    token = await deps.tokenVerifier.verifyIdToken(bearerToken);
  } catch {
    throw new AccessError("Authentication is required.", "AUTH_REQUIRED");
  }

  const doctor = await deps.doctors.findByAuthUid(token.uid);

  return {
    doctor: assertActiveDoctor(doctor),
    token,
  };
}

export function createAuthenticationMiddleware(
  deps: WorkerDependencies,
): RequestHandler {
  return async (req, res, next) => {
    try {
      res.locals.auth = await authenticateRequest(req, deps);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authenticatedContext(res: Response): AuthContext {
  const auth = res.locals.auth as AuthContext | undefined;

  if (!auth) {
    throw new HttpError(
      500,
      "Authentication middleware is missing.",
      "INTERNAL_ERROR",
    );
  }

  return auth;
}

export async function requireOwner(
  req: Request,
  deps: WorkerDependencies,
): Promise<AuthContext> {
  const auth = await authenticateRequest(req, deps);
  assertOwner(auth.doctor);
  return auth;
}

export function requireClinicScope(doctor: Doctor, clinicId: string): Doctor {
  return assertClinicScope(doctor, clinicId);
}
