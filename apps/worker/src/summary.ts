import {
  renderSummaryPrompt,
  requirePatientId,
  sanitizeClinicalSummaryText,
  type Recording
} from "@bharatdoc/shared";
import { HttpError, toHttpError } from "./http-errors.js";
import {
  claimProcessingJob, processingIdempotencyKey, reconcileProcessingArtifacts,
  PROVIDER_PROCESSING_TIMEOUT_MS, requireLease, runWithProcessingDeadline, sha256, withProcessingHeartbeat
} from "./processing.js";
import type { AuthContext, ProcessingJobClaim, WorkerDependencies } from "./types.js";

export interface SummaryRequestInput {
  recordingId?: string;
  idempotencyKey?: string;
  processingClaim?: ProcessingJobClaim;
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
  deps: Pick<WorkerDependencies, "recordings" | "summaryClient"> &
    Partial<Pick<WorkerDependencies, "processingJobs" | "pdfStorage" | "logger">>
): Promise<SummaryResponse> {
  const clinicId = requireClinicId(auth.doctor.clinic_id);
  if (deps.processingJobs && deps.pdfStorage) {
    await reconcileProcessingArtifacts(deps.processingJobs, { pdfStorage: deps.pdfStorage });
  }
  const recordingId = requireRecordingId(input.recordingId);
  let recording = requireTranscribableRecording(
    await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id)
  );
  const prompt = renderSummaryPrompt(auth.doctor.custom_prompt, recording.transcript!);
  const inputHash = sha256(prompt);
  const idempotencyKey = input.idempotencyKey?.trim() ||
    processingIdempotencyKey("summary", recording.id, inputHash);
  const claim = input.processingClaim ?? (deps.processingJobs
    ? await claimProcessingJob(deps.processingJobs, {
        operation: "summary", idempotencyKey, inputHash, recordingId: recording.id,
        doctorId: auth.doctor.id, clinicId
      })
    : null);

  if (claim?.disposition === "completed") {
    recording = requireTranscribableRecording(
      await deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id)
    );
    if (!recording.summary?.trim()) {
      throw new HttpError(409, "Completed summary result is unavailable.", "PROCESSING_RESULT_MISSING");
    }
    return { recording_id: recording.id, summary: recording.summary, status: "summary_ready" };
  }

  const lease = claim ? requireLease(claim) : null;
  const providerRequestKey = lease ? `${lease.jobId}:summary` : undefined;
  try {
    if (lease && deps.processingJobs) {
      await deps.processingJobs.markProviderSubmitted({ ...lease, providerRequestKey: providerRequestKey! });
    }
    const startedAt = Date.now();
    const providerWork = (leaseSignal?: AbortSignal) => runWithProcessingDeadline((signal) => deps.summaryClient.summarize({
      prompt, recording, doctor: auth.doctor,
      ...(providerRequestKey ? { idempotencyKey: providerRequestKey } : {}), signal
    }), PROVIDER_PROCESSING_TIMEOUT_MS, "PROVIDER_TIMEOUT", leaseSignal);
    const summary = sanitizeClinicalSummaryText(
      lease && deps.processingJobs
        ? await withProcessingHeartbeat(deps.processingJobs, lease, providerWork)
        : await providerWork()
    );

    if (lease && deps.processingJobs) {
      await deps.processingJobs.recordProviderCall({
        ...lease, provider: "openai", latencyMs: Date.now() - startedAt, estimatedCostUsd: 0.0002
      });
    }

    if (!summary) {
      throw new HttpError(502, "Summary provider returned an empty response.", "SUMMARY_EMPTY");
    }

    const supersededPdf = recording.pdf_storage_path;
    await deps.recordings.markRecordingSummarized({
      recordingId: recording.id, doctorId: auth.doctor.id, summary,
      ...(lease ? {
        expectedTranscript: recording.transcript!, processingJobId: lease.jobId,
        processingLeaseToken: lease.leaseToken
      } : {})
    });
    if (supersededPdf && lease && deps.processingJobs) {
      await deps.processingJobs.supersedeArtifacts({
        recordingId: recording.id, kind: "pdf", keepStoragePath: ""
      });
      if (deps.pdfStorage) {
        await reconcileProcessingArtifacts(deps.processingJobs, { pdfStorage: deps.pdfStorage });
      }
    }
    return { recording_id: recording.id, summary, status: "summary_ready" };
  } catch (error) {
    if (lease && deps.processingJobs && !input.processingClaim) {
      try {
        await deps.processingJobs.fail({ ...lease, errorCode: toHttpError(error).code });
      } catch {
        // A lost lease must not mask the operation error.
      }
    }
    throw error;
  }
}
