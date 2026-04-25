import { AccessError } from "@bharatdoc/shared";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { consoleStructuredLogger, type StructuredLogger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "HTTP_ERROR",
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
    return new HttpError(
      413,
      "Audio file exceeds the Phase 1 size limit.",
      "AUDIO_TOO_LARGE",
    );
  }

  if (error instanceof AccessError) {
    const status = error.code === "AUTH_REQUIRED" ? 401 : 403;
    return new HttpError(status, error.message, error.code);
  }

  if (error instanceof ZodError) {
    return new HttpError(400, "Request validation failed.", "VALIDATION_ERROR");
  }

  if (error instanceof Error) {
    return new HttpError(500, "Internal server error.", "INTERNAL_ERROR");
  }

  return new HttpError(500, "Internal server error.", "INTERNAL_ERROR");
}

export interface SanitizedError {
  error_code: string;
  error_message: string;
  error_status: number;
  error_name: string;
  upstream_status?: number;
  upstream_code?: string;
  upstream_type?: string;
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, 120)
    : undefined;
}

function upstreamMetadata(
  error: unknown,
): Pick<SanitizedError, "upstream_status" | "upstream_code" | "upstream_type"> {
  if (!error || typeof error !== "object") {
    return {};
  }

  const candidate = error as {
    status?: unknown;
    code?: unknown;
    type?: unknown;
  };
  const metadata: Pick<
    SanitizedError,
    "upstream_status" | "upstream_code" | "upstream_type"
  > = {};

  if (typeof candidate.status === "number") {
    metadata.upstream_status = candidate.status;
  }

  const upstreamCode = safeString(candidate.code);
  if (upstreamCode) {
    metadata.upstream_code = upstreamCode;
  }

  const upstreamType = safeString(candidate.type);
  if (upstreamType) {
    metadata.upstream_type = upstreamType;
  }

  return metadata;
}

export function sanitizeErrorForTelemetry(error: unknown): SanitizedError {
  const httpError = toHttpError(error);
  const errorName = error instanceof Error ? error.name : typeof error;
  const isInternal =
    httpError.status >= 500 && httpError.code === "INTERNAL_ERROR";

  return {
    error_code: httpError.code,
    error_message: isInternal ? "Internal server error." : httpError.message,
    error_status: httpError.status,
    error_name: errorName,
    ...upstreamMetadata(error),
  };
}

export function createErrorHandler(
  logger: StructuredLogger = consoleStructuredLogger,
): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const httpError = toHttpError(error);
    const sanitizedError = sanitizeErrorForTelemetry(error);
    const requestId =
      typeof res.locals.requestId === "string"
        ? res.locals.requestId
        : undefined;

    logger.error("http.request.failed", {
      request_id: requestId,
      method: req.method,
      path: req.path,
      ...sanitizedError,
    });

    res.status(httpError.status).json({
      error: {
        code: httpError.code,
        message: httpError.message,
      },
    });
  };
}

export const errorHandler = createErrorHandler();
