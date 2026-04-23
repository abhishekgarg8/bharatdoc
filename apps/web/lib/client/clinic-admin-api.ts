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

async function parseJson<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
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
  const payload = await parseJson<PendingApprovalsResponse>(response, "Unable to load pending approvals.");

  return payload.pending;
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

  await parseJson<{ ok: true }>(response, "Unable to approve doctor.");
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

  await parseJson<{ ok: true }>(response, "Unable to reject doctor.");
}
