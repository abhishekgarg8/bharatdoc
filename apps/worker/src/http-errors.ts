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
  upstream_message?: string;
  upstream_param?: string;
}

function safeString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, 120)
    : undefined;
}

function upstreamMetadata(
  error: unknown,
): Pick<
  SanitizedError,
  | "upstream_status"
  | "upstream_code"
  | "upstream_type"
  | "upstream_message"
  | "upstream_param"
> {
  if (!error || typeof error !== "object") {
    return {};
  }

  const candidate = error as {
    status?: unknown;
    code?: unknown;
    type?: unknown;
    message?: unknown;
    param?: unknown;
  };
  const metadata: Pick<
    SanitizedError,
    | "upstream_status"
    | "upstream_code"
    | "upstream_type"
    | "upstream_message"
    | "upstream_param"
  > = {};

  const upstreamCode = safeString(candidate.code);
  const upstreamType = safeString(candidate.type);
  const upstreamParam = safeString(candidate.param);
  const hasUpstreamMetadata =
    typeof candidate.status === "number" ||
    Boolean(upstreamCode) ||
    Boolean(upstreamType) ||
    Boolean(upstreamParam);

  if (typeof candidate.status === "number") {
    metadata.upstream_status = candidate.status;
  }

  if (upstreamCode) {
    metadata.upstream_code = upstreamCode;
  }

  if (upstreamType) {
    metadata.upstream_type = upstreamType;
  }

  const upstreamMessage = safeString(candidate.message);
  if (upstreamMessage && hasUpstreamMetadata) {
    metadata.upstream_message = upstreamMessage;
  }

  if (upstreamParam) {
    metadata.upstream_param = upstreamParam;
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

function responseMessageForError(httpError: HttpError): string {
  return httpError.status >= 500 && httpError.code === "INTERNAL_ERROR"
    ? "Internal server error."
    : httpError.message;
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
        message: responseMessageForError(httpError),
      },
    });
  };
}

export const errorHandler = createErrorHandler();
