import { AppError } from "@/lib/server/errors";

export interface WorkerSummaryResponse {
  recording_id: string;
  summary: string;
  status: "summary_ready" | "pdf_saved";
}

export interface ProxySummaryRequestInput {
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
    return payload.error?.code ?? "WORKER_SUMMARY_FAILED";
  } catch {
    return "WORKER_SUMMARY_FAILED";
  }
}

export async function proxySummaryRequest({
  recordingId,
  bearerToken,
  workerBaseUrl,
  fetcher = fetch
}: ProxySummaryRequestInput): Promise<WorkerSummaryResponse> {
  const response = await fetcher(`${workerBaseUrl.replace(/\/$/, "")}/api/summarize`, {
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
    throw new AppError(response.status, "Unable to generate summary.", await workerErrorCode(response));
  }

  return (await response.json()) as WorkerSummaryResponse;
}
