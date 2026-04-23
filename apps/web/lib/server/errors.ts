import { ZodError } from "zod";

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

  if (error instanceof ZodError) {
    return new AppError(400, "Request validation failed.", "VALIDATION_ERROR");
  }

  if (error instanceof Error) {
    return new AppError(500, error.message, "INTERNAL_ERROR");
  }

  return new AppError(500, "Unexpected server error.", "INTERNAL_ERROR");
}

export function errorResponse(error: unknown): Response {
  const appError = toAppError(error);

  return Response.json(
    {
      error: {
        code: appError.code,
        message: appError.message
      }
    },
    { status: appError.status }
  );
}
