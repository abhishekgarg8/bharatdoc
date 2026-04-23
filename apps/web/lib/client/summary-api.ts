import {
  mapApiRecordingToDetail,
  type RecordingDetailApiRecord,
  type RecordingDetailRecord
} from "@/lib/client/recording-detail-data";

export interface RecordingDetailResponse {
  recording: RecordingDetailApiRecord;
}

export interface WorkerSummaryResponse {
  recording_id: string;
  summary: string;
  status: "summary_ready" | "pdf_saved";
}

export interface WorkerPdfResponse {
  recording_id: string;
  pdf_storage_path: string;
  signed_url: string;
  status: "pdf_saved";
}

async function parseJson<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

export async function fetchRecordingDetail(
  idToken: string,
  recordingId: string,
  fetcher: typeof fetch = fetch
): Promise<RecordingDetailRecord> {
  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  const payload = await parseJson<RecordingDetailResponse>(response, "Unable to load recording.");

  return mapApiRecordingToDetail(payload.recording);
}

export async function summarizeRecording(
  idToken: string,
  recordingId: string,
  fetcher: typeof fetch = fetch
): Promise<WorkerSummaryResponse> {
  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}/summary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  return parseJson<WorkerSummaryResponse>(response, "Unable to generate summary.");
}

export async function saveRecordingSummary(
  idToken: string,
  recordingId: string,
  summary: string,
  fetcher: typeof fetch = fetch
): Promise<RecordingDetailRecord> {
  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}/summary`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ summary })
  });
  const payload = await parseJson<RecordingDetailResponse>(response, "Unable to save summary.");

  return mapApiRecordingToDetail(payload.recording);
}

export async function generateRecordingPdf(
  idToken: string,
  recordingId: string,
  fetcher: typeof fetch = fetch
): Promise<WorkerPdfResponse> {
  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}/pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  return parseJson<WorkerPdfResponse>(response, "Unable to generate PDF.");
}
