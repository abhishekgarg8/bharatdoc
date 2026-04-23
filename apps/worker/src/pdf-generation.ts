import { requirePatientId, type Clinic, type Recording } from "@bharatdoc/shared";
import { HttpError } from "./http-errors.js";
import type { AuthContext, WorkerDependencies } from "./types.js";

export interface PdfRequestInput {
  recordingId?: string;
  generatedAt?: Date;
}

export interface PdfResponse {
  recording_id: string;
  pdf_storage_path: string;
  signed_url: string;
  status: "pdf_saved";
}

function requireClinicId(clinicId: string | null): string {
  if (!clinicId) {
    throw new HttpError(403, "Doctor must belong to a clinic.", "CLINIC_REQUIRED");
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
    throw new HttpError(404, "Clinic was not found.", "CLINIC_NOT_FOUND");
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
  deps: Pick<WorkerDependencies, "clinics" | "pdfRenderer" | "pdfStorage" | "recordings">
): Promise<PdfResponse> {
  const clinicId = requireClinicId(auth.doctor.clinic_id);
  const recordingId = requireRecordingId(input.recordingId);
  const [recording, clinic] = await Promise.all([
    deps.recordings.findRecordingForDoctor(recordingId, auth.doctor.id),
    deps.clinics.findClinicById(clinicId)
  ]);
  const pdfReadyRecording = requirePdfReadyRecording(recording);
  const pdf = requireRenderedPdf(
    await deps.pdfRenderer.render({
      clinic: requireClinic(clinic),
      doctor: auth.doctor,
      recording: pdfReadyRecording,
      generatedAt: input.generatedAt ?? new Date()
    })
  );
  const pdfStoragePath = await deps.pdfStorage.uploadRecordingPdf({
    pdf,
    clinicId,
    doctorId: auth.doctor.id,
    recordingId: pdfReadyRecording.id
  });

  await deps.recordings.markRecordingPdfSaved({
    recordingId: pdfReadyRecording.id,
    doctorId: auth.doctor.id,
    pdfStoragePath
  });

  return {
    recording_id: pdfReadyRecording.id,
    pdf_storage_path: pdfStoragePath,
    signed_url: await deps.pdfStorage.createSignedUrl(pdfStoragePath),
    status: "pdf_saved"
  };
}
