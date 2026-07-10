"use client";

import { parseJsonOrThrow } from "@/lib/client/api-error";

export interface AuthenticatedDoctor {
  id: string;
  authUserId: string;
  clinicId: string | null;
  role: "owner" | "doctor";
  accountStatus: "pending_approval" | "active" | "rejected";
  name: string;
}

export interface AuthenticatedClinic {
  id: string;
  name: string;
}

export interface AuthenticatedBootstrap {
  doctor: AuthenticatedDoctor;
  clinic: AuthenticatedClinic | null;
}

export interface ActiveAppContext {
  authUserId: string;
  doctorId: string;
  clinicId: string | null;
  clinicName: string;
  doctorName?: string;
  permissions: { canManageClinic: boolean; canRecord: boolean };
}

export type AuthenticatedAppState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | {
      status: "pending";
      token: string;
      doctor: AuthenticatedDoctor;
      clinic: AuthenticatedClinic | null;
    }
  | {
      status: "rejected";
      token: string;
      doctor: AuthenticatedDoctor;
      clinic: AuthenticatedClinic | null;
    }
  | {
      status: "active_online";
      token: string;
      context: ActiveAppContext;
      source: "network";
      refreshedAt: number;
    }
  | {
      status: "active_offline_stale";
      token: string;
      context: ActiveAppContext;
      source: "cache";
      cachedAt: number;
      expiresAt: number;
    }
  | { status: "active_demo"; context: ActiveAppContext; source: "demo" }
  | { status: "error"; kind: "bootstrap"; retryable: true; message: string };

export class TimeoutError extends Error {
  constructor() {
    super("The account request timed out.");
    this.name = "TimeoutError";
  }
}

interface BootstrapOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface SharedRequest {
  key: string;
  controller: AbortController;
  promise: Promise<AuthenticatedBootstrap>;
  consumers: number;
  settled: boolean;
}

const requests = new Map<string, SharedRequest>();

function consume(
  request: SharedRequest,
  signal?: AbortSignal,
): Promise<AuthenticatedBootstrap> {
  request.consumers += 1;
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
  return Promise.race([request.promise, cancelled]).finally(() => {
    if (abort) signal?.removeEventListener("abort", abort);
    request.consumers -= 1;
    if (!request.settled && request.consumers === 0) {
      request.controller.abort();
      if (requests.get(request.key) === request) requests.delete(request.key);
    }
  });
}

function isBootstrap(value: unknown): value is AuthenticatedBootstrap {
  const candidate = value as Partial<AuthenticatedBootstrap> | null;
  const doctor = candidate?.doctor as Partial<AuthenticatedDoctor> | undefined;
  const clinic = candidate?.clinic as
    | Partial<AuthenticatedClinic>
    | null
    | undefined;
  return Boolean(
    doctor &&
    typeof doctor.id === "string" &&
    typeof doctor.authUserId === "string" &&
    (typeof doctor.clinicId === "string" || doctor.clinicId === null) &&
    (doctor.role === "owner" || doctor.role === "doctor") &&
    ["active", "pending_approval", "rejected"].includes(
      doctor.accountStatus ?? "",
    ) &&
    typeof doctor.name === "string" &&
    (clinic === null ||
      (typeof clinic?.id === "string" && typeof clinic.name === "string")),
  );
}

export function fetchAuthenticatedBootstrap(
  token: string,
  fetcher: typeof fetch = fetch,
  options: BootstrapOptions = {},
): Promise<AuthenticatedBootstrap> {
  if (options.signal?.aborted)
    return Promise.reject(new DOMException("Aborted", "AbortError"));

  const existing = requests.get(token);
  if (existing) return consume(existing, options.signal);

  const controller = new AbortController();
  let timeout!: ReturnType<typeof setTimeout>;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new TimeoutError());
      controller.abort();
    }, options.timeoutMs ?? 8_000);
  });

  let response: Promise<Response>;
  try {
    response = Promise.resolve(
      fetcher("/api/me", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }),
    );
  } catch (error) {
    response = Promise.reject(error);
  }
  const promise = Promise.race([response, timeoutFailure])
    .then((response) =>
      parseJsonOrThrow<unknown>(response, "Unable to load your account."),
    )
    .then((value) => {
      if (!isBootstrap(value))
        throw new Error("Account bootstrap returned an invalid payload.");
      return value;
    })
    .finally(() => {
      clearTimeout(timeout);
      request.settled = true;
      if (requests.get(token)?.promise === promise) requests.delete(token);
    });

  const request: SharedRequest = {
    key: token,
    controller,
    promise,
    consumers: 0,
    settled: false,
  };
  requests.set(token, request);
  return consume(request, options.signal);
}

export function clearAuthenticatedBootstrapRequests(): void {
  for (const request of requests.values()) request.controller.abort();
  requests.clear();
}
