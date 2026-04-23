import { AppError } from "@/lib/server/errors";

export interface WorkerPdfResponse {
  recording_id: string;
  pdf_storage_path: string;
  signed_url: string;
  status: "pdf_saved";
}

export interface ProxyPdfRequestInput {
  recordingId: string;
  bearerToken: string;
  workerBaseUrl: string;
  fetcher?: typeof fetch;
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
  fetcher = fetch
}: ProxyPdfRequestInput): Promise<WorkerPdfResponse> {
  const response = await fetcher(`${workerBaseUrl.replace(/\/$/, "")}/api/generate-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      recording_id: requireRecordingId(recordingId)
    })
  });

  if (!response.ok) {
    throw new AppError(response.status, "Unable to generate PDF.", await workerErrorCode(response));
  }

  return (await response.json()) as WorkerPdfResponse;
}
