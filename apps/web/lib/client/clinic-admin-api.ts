import { parseJsonOrThrow } from "@/lib/client/api-error";

import type { Doctor } from "@bharatdoc/shared";

export interface PendingApprovalDoctor {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  created_at: string;
}

export interface PendingApproval {
  id: string;
  requested_at: string;
  doctor: PendingApprovalDoctor;
}

export interface PendingApprovalsResponse {
  pending: PendingApproval[];
}

export interface ActiveClinicDoctor {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  role: "owner" | "doctor";
  recordings_count: number;
  created_at: string;
}

export interface ReviewedClinicDoctor extends ActiveClinicDoctor {
  account_status: "rejected";
}

export interface ClinicProfile {
  id: string;
  name: string;
  code: string;
  address: string | null;
  activeDoctorsCount: number;
}

export interface ClinicAdminSnapshot {
  clinic: ClinicProfile;
  activeDoctors: ActiveClinicDoctor[];
  pendingApprovals: PendingApproval[];
  rejectedDoctors: ReviewedClinicDoctor[];
}

export interface SettingsBootstrapSnapshot {
  doctor: Doctor;
  clinic: ClinicProfile | null;
  activeDoctors: ActiveClinicDoctor[];
  pendingApprovals: PendingApproval[];
  rejectedDoctors: ReviewedClinicDoctor[];
}

export interface ClinicProfileUpdate {
  name?: string;
  code?: string;
  address?: string | null;
}

function authHeaders(idToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${idToken}`
  };
}

export async function fetchPendingApprovals(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<PendingApproval[]> {
  const response = await fetcher("/api/clinic/join-requests", {
    headers: authHeaders(idToken)
  });
  const payload = await parseJsonOrThrow<PendingApprovalsResponse>(response, "Unable to load pending approvals.");

  return payload.pending;
}

export async function fetchClinicAdminSnapshot(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<ClinicAdminSnapshot> {
  const response = await fetcher("/api/clinic/admin", {
    headers: authHeaders(idToken)
  });

  return parseJsonOrThrow<ClinicAdminSnapshot>(response, "Unable to load hospital admin details.");
}

export async function fetchSettingsBootstrap(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<SettingsBootstrapSnapshot> {
  const response = await fetcher("/api/settings/bootstrap", {
    headers: authHeaders(idToken)
  });

  return parseJsonOrThrow<SettingsBootstrapSnapshot>(response, "Unable to load settings.");
}

export async function updateClinicProfile(
  idToken: string,
  input: ClinicProfileUpdate,
  fetcher: typeof fetch = fetch
): Promise<ClinicProfile> {
  const response = await fetcher("/api/clinic/admin", {
    method: "PATCH",
    headers: {
      ...authHeaders(idToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const payload = await parseJsonOrThrow<{ clinic: ClinicProfile }>(response, "Unable to update hospital profile.");

  return payload.clinic;
}

export async function approvePendingDoctor(
  idToken: string,
  requestId: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(`/api/clinic/join-requests/${requestId}/approve`, {
    method: "POST",
    headers: authHeaders(idToken)
  });

  await parseJsonOrThrow<{ ok: true }>(response, "Unable to approve doctor.");
}

export async function rejectPendingDoctor(
  idToken: string,
  requestId: string,
  reason: string | null,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(`/api/clinic/join-requests/${requestId}/reject`, {
    method: "POST",
    headers: {
      ...authHeaders(idToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason })
  });

  await parseJsonOrThrow<{ ok: true }>(response, "Unable to reject doctor.");
}

export async function removeClinicDoctor(
  idToken: string,
  doctorId: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(`/api/clinic/doctors/${doctorId}/remove`, {
    method: "POST",
    headers: authHeaders(idToken)
  });

  await parseJsonOrThrow<{ ok: true }>(response, "Unable to remove doctor.");
}

export async function reapproveClinicDoctor(
  idToken: string,
  doctorId: string,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(`/api/clinic/doctors/${doctorId}/reapprove`, {
    method: "POST",
    headers: authHeaders(idToken)
  });

  await parseJsonOrThrow<{ ok: true }>(response, "Unable to re-approve doctor.");
}
