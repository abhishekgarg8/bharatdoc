"use client";

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null = null
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export class AuthSessionExpiredError extends ApiResponseError {
  constructor(message = "Please sign in again.") {
    super(message, 401, "AUTH_REQUIRED");
    this.name = "AuthSessionExpiredError";
  }
}

export function isAuthSessionExpiredError(error: unknown): error is AuthSessionExpiredError {
  return error instanceof AuthSessionExpiredError;
}

export async function parseJsonOrThrow<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    error?: {
      code?: string;
      message?: string;
    };
  } | null;

  if (!response.ok) {
    const code = body?.error?.code ?? null;

    if (response.status === 401 || code === "AUTH_REQUIRED") {
      throw new AuthSessionExpiredError(body?.error?.message ?? "Please sign in again.");
    }

    throw new ApiResponseError(body?.error?.message ?? fallbackMessage, response.status, code);
  }

  return body as T;
}

export async function recoverExpiredSession(
  error: unknown,
  signOut: () => Promise<void>,
  navigate: (href: string) => void
): Promise<boolean> {
  if (!isAuthSessionExpiredError(error)) {
    return false;
  }

  await signOut().catch(() => undefined);
  navigate("/onboarding");

  return true;
}
