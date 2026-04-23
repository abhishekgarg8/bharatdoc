import { AccessError } from "@bharatdoc/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "HTTP_ERROR"
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (
    error instanceof Error &&
    error.name === "MulterError" &&
    "code" in error &&
    error.code === "LIMIT_FILE_SIZE"
  ) {
    return new HttpError(413, "Audio file exceeds the Phase 1 size limit.", "AUDIO_TOO_LARGE");
  }

  if (error instanceof AccessError) {
    const status = error.code === "AUTH_REQUIRED" ? 401 : 403;
    return new HttpError(status, error.message, error.code);
  }

  if (error instanceof ZodError) {
    return new HttpError(400, "Request validation failed.", "VALIDATION_ERROR");
  }

  if (error instanceof Error) {
    return new HttpError(500, error.message, "INTERNAL_ERROR");
  }

  return new HttpError(500, "Unexpected server error.", "INTERNAL_ERROR");
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const httpError = toHttpError(error);

  res.status(httpError.status).json({
    error: {
      code: httpError.code,
      message: httpError.message
    }
  });
};
