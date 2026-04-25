import type { Doctor } from "@bharatdoc/shared";

export interface PendingApprovalOwner {
  id: string;
  name: string;
}

export interface PendingApprovalClinic {
  id: string;
  name: string;
  code: string;
  address: string | null;
}

export interface PendingApprovalJoinRequest {
  id: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
}

export type PendingApprovalStatus =
  | {
      account_status: "pending_approval";
      doctor: Doctor;
      clinic: PendingApprovalClinic;
      owner: PendingApprovalOwner | null;
      join_request: PendingApprovalJoinRequest | null;
    }
  | {
      account_status: "active" | "rejected";
      doctor: Doctor;
      redirectTo: "/dashboard" | "/access-rejected";
    };

async function parseJson<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export async function fetchPendingApprovalStatus(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<PendingApprovalStatus> {
  const response = await fetcher("/api/onboarding/pending-status", {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  return parseJson<PendingApprovalStatus>(response, "Unable to load approval status.");
}
