import type { Doctor } from "@bharatdoc/shared";
import { parseJsonOrThrow } from "@/lib/client/api-error";

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

export async function fetchPendingApprovalStatus(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<PendingApprovalStatus> {
  const response = await fetcher("/api/onboarding/pending-status", {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  return parseJsonOrThrow<PendingApprovalStatus>(response, "Unable to load approval status.");
}
