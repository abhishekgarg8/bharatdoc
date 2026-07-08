import {
  renderSummaryPrompt,
  requirePatientId,
  sanitizeClinicalSummaryText,
  type Recording
} from "@bharatdoc/shared";
import { HttpError } from "./http-errors.js";
import type { AuthContext, WorkerDependencies } from "./types.js";

export interface SummaryRequestInput {
  recordingId?: string;
}

export interface SummaryResponse {
  recording_id: string;
  summary: string;
  status: "summary_ready";
}

function requireClinicId(clinicId: string | null): string {
  if (!clinicId) {
    throw new HttpError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  }

  return clinicId;
}

function requireRecordingId(recordingId: string | undefined): string {
  const trimmed = recordingId?.trim();

  if (!trimmed) {
    throw new HttpError(400, "Recording ID is required.", "RECORDING_ID_REQUIRED");
  }

  return trimmed;
}

function requireTranscribableRecording(recording: Recording | null): Recording {
  if (!recording) {
    throw new HttpError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  try {
    requirePatientId(recording.patient_id);
  } catch {
    throw new HttpError(400, "Patient ID is required before summary generation.", "PATIENT_ID_REQUIRED");
  }

  if (!recording.transcript?.trim()) {
    throw new HttpError(400, "Transcript is required before summary generation.", "TRANSCRIPT_REQUIRED");
  }

  return recording;
}

export async function summarizeRecording(
  auth: AuthContext,
  input: SummaryRequestInput,
  deps: Pick<WorkerDependencies, "recordings" | "summaryClient">
): Promise<SummaryResponse> {
  requireClinicId(auth.doctor.clinic_id);
  const recordingId = requireRecordingId(input.recordingId);
  const recording = requireTranscribableRecording(
    await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id)
  );
  const prompt = renderSummaryPrompt(auth.doctor.custom_prompt, recording.transcript!);
  const summary = sanitizeClinicalSummaryText(
    await deps.summaryClient.summarize({ prompt, recording, doctor: auth.doctor })
  );

  if (!summary) {
    throw new HttpError(502, "Summary provider returned an empty response.", "SUMMARY_EMPTY");
  }

  await deps.recordings.markRecordingSummarized({
    recordingId: recording.id,
    doctorId: auth.doctor.id,
    summary
  });

  return {
    recording_id: recording.id,
    summary,
    status: "summary_ready"
  };
}
