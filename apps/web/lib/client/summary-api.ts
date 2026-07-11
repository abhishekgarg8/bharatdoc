import {
  mapApiRecordingToDetail,
  type RecordingDetailApiRecord,
  type RecordingDetailRecord
} from "@/lib/client/recording-detail-data";
import { parseJsonOrThrow } from "@/lib/client/api-error";
import type { Doctor } from "@bharatdoc/shared";

export interface RecordingDetailResponse {
  doctor?: Doctor;
  recording: RecordingDetailApiRecord;
}

export interface RecordingDetailBootstrap {
  doctor: Doctor;
  recording: RecordingDetailRecord;
}

export interface WorkerSummaryResponse {
  recording_id: string;
  summary: string;
  status: "summary_ready" | "pdf_saved";
}

export interface WorkerPdfResponse {
  recording_id: string;
  signed_url: string;
  status: "pdf_saved";
  has_pdf: true;
  pdf_generated_at: string;
  pdf_version: string;
}

export interface DeleteRecordingResponse {
  recording_id: string;
  deletion: { id: string; state: "queued" | "running" | "completed" | "failed"; error_code: string | null };
}

export async function retryRecordingDeletion(idToken: string, receiptId: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`/api/deletions/${encodeURIComponent(receiptId)}`, {
    method: "POST", headers: { Authorization: `Bearer ${idToken}` }
  });
  return parseJsonOrThrow<{ deletion: DeleteRecordingResponse["deletion"] }>(response, "Unable to retry deletion cleanup.");
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
  const payload = await parseJsonOrThrow<RecordingDetailResponse>(response, "Unable to load recording.");

  return mapApiRecordingToDetail(payload.recording);
}

export async function fetchRecordingDetailBootstrap(
  idToken: string,
  recordingId: string,
  fetcher: typeof fetch = fetch
): Promise<RecordingDetailBootstrap> {
  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  const payload = await parseJsonOrThrow<{ doctor: Doctor; recording: RecordingDetailApiRecord }>(
    response,
    "Unable to load recording."
  );

  return {
    doctor: payload.doctor,
    recording: mapApiRecordingToDetail(payload.recording)
  };
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

  return parseJsonOrThrow<WorkerSummaryResponse>(response, "Unable to generate summary.");
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
  const payload = await parseJsonOrThrow<RecordingDetailResponse>(response, "Unable to save summary.");

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

  return parseJsonOrThrow<WorkerPdfResponse>(response, "Unable to generate PDF.");
}

export async function deleteRecording(
  idToken: string,
  recordingId: string,
  fetcher: typeof fetch = fetch
): Promise<DeleteRecordingResponse> {
  const response = await fetcher(`/api/recordings/${encodeURIComponent(recordingId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  return parseJsonOrThrow<DeleteRecordingResponse>(response, "Unable to delete consultation.");
}
