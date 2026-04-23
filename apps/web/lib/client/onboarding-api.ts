"use client";

import type { RegistrationInput } from "@bharatdoc/shared";

export interface ClinicLookupResponse {
  clinic_id: string;
  clinic_name: string;
  clinic_address: string | null;
}

export interface RegisterResponse {
  status: "active" | "pending_approval" | "existing_account";
  role: "owner" | "doctor";
  account_status?: "pending_approval" | "active" | "rejected";
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Request failed.");
  }

  return body;
}

export async function lookupClinic(code: string, fetcher: typeof fetch = fetch): Promise<ClinicLookupResponse> {
  const response = await fetcher(`/api/clinics/lookup?code=${encodeURIComponent(code)}`);
  return (await readJsonOrThrow(response)) as ClinicLookupResponse;
}

export async function registerAccount(
  idToken: string,
  input: RegistrationInput,
  fetcher: typeof fetch = fetch
): Promise<RegisterResponse> {
  const response = await fetcher("/api/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(input)
  });

  return (await readJsonOrThrow(response)) as RegisterResponse;
}

export function destinationForRegistration(result: RegisterResponse): string {
  if (result.status === "active" || result.account_status === "active") {
    return "/dashboard";
  }

  if (result.status === "pending_approval" || result.account_status === "pending_approval") {
    return "/pending-approval";
  }

  if (result.account_status === "rejected") {
    return "/access-rejected";
  }

  return "/onboarding";
}
