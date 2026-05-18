import { ZodError } from "zod";
import { AccessError } from "@bharatdoc/shared";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof AccessError) {
    const statusByCode: Record<AccessError["code"], number> = {
      AUTH_REQUIRED: 401,
      ACCOUNT_INACTIVE: 403,
      OWNER_REQUIRED: 403,
      CLINIC_SCOPE_REQUIRED: 403,
      SELF_REMOVAL_FORBIDDEN: 400
    };

    return new AppError(statusByCode[error.code], error.message, error.code);
  }

  if (error instanceof ZodError) {
    return new AppError(400, "Request validation failed.", "VALIDATION_ERROR");
  }

  if (error instanceof Error) {
    return new AppError(500, "Internal server error.", "INTERNAL_ERROR");
  }

  return new AppError(500, "Internal server error.", "INTERNAL_ERROR");
}

function requestIdFor(request: Request | undefined): string {
  return request?.headers.get("x-request-id")?.trim() || crypto.randomUUID();
}

function requestPathFor(request: Request | undefined): string | null {
  if (!request) {
    return null;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

function boundedErrorText(value: string | undefined, maxLength: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export function errorResponse(error: unknown, request?: Request): Response {
  const appError = toAppError(error);
  const internalError = error instanceof Error ? error : null;
  const requestId = requestIdFor(request);
  const logPayload = {
    request_id: requestId,
    method: request?.method ?? null,
    path: requestPathFor(request),
    error_code: appError.code,
    error_status: appError.status,
    error_name: error instanceof Error ? error.name : typeof error,
    error_message: appError.status >= 500 ? "Internal server error." : appError.message,
    ...(appError.status >= 500
      ? {
          internal_error_message: boundedErrorText(internalError?.message ?? String(error), 1000),
          internal_error_stack: boundedErrorText(internalError?.stack, 4000)
        }
      : {})
  };

  if (appError.status >= 500) {
    console.error("api.request.failed", logPayload);
  } else {
    console.warn("api.request.rejected", logPayload);
  }

  return Response.json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        request_id: requestId
      }
    },
    { status: appError.status }
  );
}
