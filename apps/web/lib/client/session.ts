"use client";

import type { Doctor } from "@bharatdoc/shared";
import { parseJsonOrThrow } from "@/lib/client/api-error";

export interface MeResponse {
  doctor: Doctor;
}

export function destinationForDoctorStatus(status: MeResponse["doctor"]["account_status"]): string {
  if (status === "active") {
    return "/dashboard";
  }

  if (status === "pending_approval") {
    return "/pending-approval";
  }

  return "/access-rejected";
}

export function destinationForInactiveDoctor(doctor: Doctor): string | null {
  if (doctor.account_status === "active") {
    return null;
  }

  return destinationForDoctorStatus(doctor.account_status);
}

export async function fetchCurrentDoctor(idToken: string, fetcher: typeof fetch = fetch): Promise<MeResponse> {
  const response = await fetcher("/api/me", {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  return parseJsonOrThrow<MeResponse>(response, "Unable to load current doctor.");
}
