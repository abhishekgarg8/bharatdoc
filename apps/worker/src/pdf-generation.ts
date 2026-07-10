import { requirePatientId, type Clinic, type Recording } from "@bharatdoc/shared";
import { HttpError, toHttpError } from "./http-errors.js";
import {
  claimProcessingJob, processingIdempotencyKey, reconcileProcessingArtifacts,
  requireLease, sha256, withProcessingHeartbeat
} from "./processing.js";
import type { AuthContext, WorkerDependencies } from "./types.js";

export interface PdfRequestInput {
  recordingId?: string;
  generatedAt?: Date;
  idempotencyKey?: string;
}

export interface PdfResponse {
  recording_id: string;
  pdf_storage_path: string;
  signed_url: string;
  status: "pdf_saved";
  pdf_generated_at: string;
  pdf_version: string;
}

const PDF_STORAGE_RESERVATION_BYTES = 5 * 1024 * 1024;

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

function requireClinic(clinic: Clinic | null): Clinic {
  if (!clinic) {
    throw new HttpError(404, "Hospital was not found.", "CLINIC_NOT_FOUND");
  }

  return clinic;
}

function requirePdfReadyRecording(recording: Recording | null): Recording {
  if (!recording) {
    throw new HttpError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  try {
    requirePatientId(recording.patient_id);
  } catch {
    throw new HttpError(400, "Patient ID is required before PDF generation.", "PATIENT_ID_REQUIRED");
  }

  if (!recording.summary?.trim()) {
    throw new HttpError(400, "Summary is required before PDF generation.", "SUMMARY_REQUIRED");
  }

  return recording;
}

function requireRenderedPdf(pdf: Buffer): Buffer {
  if (!pdf.byteLength) {
    throw new HttpError(502, "PDF renderer returned an empty file.", "PDF_RENDER_FAILED");
  }

  return pdf;
}

export async function generateRecordingPdf(
  auth: AuthContext,
  input: PdfRequestInput,
  deps: Pick<WorkerDependencies, "clinics" | "pdfRenderer" | "pdfStorage" | "recordings"> &
    Partial<Pick<WorkerDependencies, "processingJobs" | "logger">>
): Promise<PdfResponse> {
  const clinicId = requireClinicId(auth.doctor.clinic_id);
  if (deps.processingJobs) {
    await reconcileProcessingArtifacts(deps.processingJobs, { pdfStorage: deps.pdfStorage });
  }
  const recordingId = requireRecordingId(input.recordingId);
  const [recording, clinic] = await Promise.all([
    deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id),
    deps.clinics.findClinicById(clinicId)
  ]);
  const pdfReadyRecording = requirePdfReadyRecording(recording);
  const inputHash = sha256(`pdf-v1\n${pdfReadyRecording.summary}`);
  const idempotencyKey = input.idempotencyKey?.trim() || processingIdempotencyKey("pdf", recordingId, inputHash);
  const claimInput = {
    operation: "pdf" as const, idempotencyKey, inputHash, recordingId,
    doctorId: auth.doctor.id, clinicId, storageBytes: PDF_STORAGE_RESERVATION_BYTES
  };
  let claim = deps.processingJobs
    ? await claimProcessingJob(deps.processingJobs, {
        ...claimInput
      })
    : null;
  if (claim?.disposition === "completed") {
    const result = claim.job.result as Partial<PdfResponse> | null;
    if (result?.pdf_storage_path && pdfReadyRecording.pdf_storage_path !== result.pdf_storage_path && deps.processingJobs) {
      await deps.processingJobs.invalidateCompleted({
        jobId: claim.job.id, inputHash, errorCode: "PROCESSING_ARTIFACT_SUPERSEDED"
      });
      claim = await claimProcessingJob(deps.processingJobs, claimInput);
    }
  }
  if (claim?.disposition === "completed") {
    const result = claim.job.result as Partial<PdfResponse> | null;
    if (
      !result || result.recording_id !== recordingId || !result.pdf_storage_path ||
      !result.pdf_generated_at || !result.pdf_version
    ) {
      throw new HttpError(409, "Completed PDF result is unavailable.", "PROCESSING_RESULT_MISSING");
    }
    return {
      recording_id: recordingId, pdf_storage_path: result.pdf_storage_path,
      signed_url: await deps.pdfStorage.createSignedUrl(result.pdf_storage_path), status: "pdf_saved",
      pdf_generated_at: result.pdf_generated_at, pdf_version: result.pdf_version
    };
  }

  const lease = claim ? requireLease(claim) : null;
  const providerRequestKey = lease ? `${lease.jobId}:pdf` : undefined;
  const generatedAt = input.generatedAt ?? (claim ? new Date(claim.job.createdAt) : new Date());
  let uploadedPath: string | null = null;
  let artifactPath: string | null = null;
  let published = false;
  try {
    if (lease && deps.processingJobs) {
      await deps.processingJobs.markProviderSubmitted({ ...lease, providerRequestKey: providerRequestKey! });
    }
    const startedAt = Date.now();
    const render = () => deps.pdfRenderer.render({
      clinic: requireClinic(clinic), doctor: auth.doctor, recording: pdfReadyRecording, generatedAt
    });
    const pdf = requireRenderedPdf(
      lease && deps.processingJobs
        ? await withProcessingHeartbeat(deps.processingJobs, lease, render)
        : await render()
    );
    if (pdf.byteLength > PDF_STORAGE_RESERVATION_BYTES) {
      throw new HttpError(413, "Generated PDF exceeds the storage limit.", "PDF_TOO_LARGE");
    }
    await (lease && deps.processingJobs
      ? deps.processingJobs.recordProviderCall({
          ...lease, provider: "react-pdf", latencyMs: Date.now() - startedAt, estimatedCostUsd: 0
        })
      : Promise.resolve());
    const pdfGeneratedAt = generatedAt.toISOString();
    const pdfVersion = "v1";
    const checksum = sha256(pdf);
    const knownArtifact = lease && deps.processingJobs
      ? await deps.processingJobs.findArtifact({ jobId: lease.jobId, kind: "pdf", checksum })
      : null;
    let pdfStoragePath = knownArtifact?.storagePath ?? null;
    if (pdfStoragePath && deps.pdfStorage.downloadRecordingPdf) {
      try {
        if (sha256(await deps.pdfStorage.downloadRecordingPdf(pdfStoragePath)) !== checksum) pdfStoragePath = null;
      } catch {
        pdfStoragePath = null;
      }
    }
    if (!pdfStoragePath) {
      artifactPath = lease
        ? deps.pdfStorage.recordingPdfPath?.({
            clinicId, doctorId: auth.doctor.id, recordingId: pdfReadyRecording.id, artifactKey: inputHash
          }) ?? null
        : null;
      if (lease && deps.processingJobs && artifactPath) {
        await deps.processingJobs.recordArtifact({
          ...lease, kind: "pdf", storagePath: artifactPath, byteSize: pdf.byteLength, checksum, state: "pending"
        });
      }
      pdfStoragePath = uploadedPath = await deps.pdfStorage.uploadRecordingPdf({
        pdf, clinicId, doctorId: auth.doctor.id, recordingId: pdfReadyRecording.id,
        ...(lease ? { artifactKey: inputHash } : {})
      });
    }
    if (lease && deps.processingJobs) {
      if (!artifactPath && !knownArtifact) {
        await deps.processingJobs.recordArtifact({
          ...lease, kind: "pdf", storagePath: pdfStoragePath, byteSize: pdf.byteLength, checksum, state: "current"
        });
      } else {
        await deps.processingJobs.markArtifactReady({ ...lease, storagePath: pdfStoragePath });
      }
    }

    await deps.recordings.markRecordingPdfSaved({
      recordingId: pdfReadyRecording.id, doctorId: auth.doctor.id, pdfStoragePath, pdfGeneratedAt, pdfVersion,
      ...(lease ? {
        expectedSummary: pdfReadyRecording.summary!, processingJobId: lease.jobId,
        processingLeaseToken: lease.leaseToken
      } : {})
    });
    published = true;
    if (lease && deps.processingJobs) {
      await deps.processingJobs.supersedeArtifacts({
        recordingId, kind: "pdf", keepStoragePath: pdfStoragePath
      });
      await reconcileProcessingArtifacts(deps.processingJobs, { pdfStorage: deps.pdfStorage });
    }
    const result: PdfResponse = {
      recording_id: pdfReadyRecording.id, pdf_storage_path: pdfStoragePath,
      signed_url: await deps.pdfStorage.createSignedUrl(pdfStoragePath), status: "pdf_saved",
      pdf_generated_at: pdfGeneratedAt, pdf_version: pdfVersion
    };
    return result;
  } catch (error) {
    if (!published && lease && deps.processingJobs) {
      if (uploadedPath || artifactPath) {
        const orphanPath = uploadedPath ?? artifactPath!;
        try {
          await deps.processingJobs.markArtifactOrphaned(orphanPath);
          await reconcileProcessingArtifacts(deps.processingJobs, { pdfStorage: deps.pdfStorage });
        } catch {
          // The durable orphan marker leaves cleanup retryable.
        }
      }
      try {
        await deps.processingJobs.fail({ ...lease, errorCode: toHttpError(error).code });
      } catch {
        // A lost lease must not mask the operation error.
      }
    }
    throw error;
  }
}
