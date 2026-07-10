import { AppError } from "@/lib/server/errors";

export interface WorkerPdfResponse {
  recording_id: string;
  pdf_storage_path: string;
  signed_url: string;
  status: "pdf_saved";
  pdf_generated_at: string;
  pdf_version: string;
}

export interface ProxyPdfRequestInput {
  recordingId: string;
  bearerToken: string;
  workerBaseUrl: string;
  fetcher?: typeof fetch;
  idempotencyKey?: string;
}

function requireRecordingId(recordingId: string): string {
  const trimmed = recordingId.trim();

  if (!trimmed) {
    throw new AppError(400, "Recording ID is required.", "RECORDING_ID_REQUIRED");
  }

  return trimmed;
}

async function workerErrorCode(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { code?: string } };
    return payload.error?.code ?? "WORKER_PDF_FAILED";
  } catch {
    return "WORKER_PDF_FAILED";
  }
}

export async function proxyPdfRequest({
  recordingId,
  bearerToken,
  workerBaseUrl,
  fetcher = fetch,
  idempotencyKey
}: ProxyPdfRequestInput): Promise<WorkerPdfResponse> {
  const response = await fetcher(`${workerBaseUrl.replace(/\/$/, "")}/api/generate-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      recording_id: requireRecordingId(recordingId)
    })
  });

  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new AppError(
      response.status, "Unable to generate PDF.", await workerErrorCode(response),
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    );
  }

  return (await response.json()) as WorkerPdfResponse;
}
