"use client";

import type { Doctor } from "@bharatdoc/shared";

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

export async function fetchCurrentDoctor(idToken: string, fetcher: typeof fetch = fetch): Promise<MeResponse> {
  const response = await fetcher("/api/me", {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  if (!response.ok) {
    throw new Error("Unable to load current doctor.");
  }

  return (await response.json()) as MeResponse;
}
