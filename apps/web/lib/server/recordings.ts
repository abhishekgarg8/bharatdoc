import {
  assertActiveDoctor,
  assertRecordingDuration,
  normalizePatientId,
  requirePatientId,
  RecordingCreateSchema,
  type Doctor,
  type Clinic,
  type Recording,
  type RecordingStatus
} from "@bharatdoc/shared";
import type { VerifiedUser } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

export interface RecordingListItem extends Recording {
  doctor_name?: string | null;
}

export interface DashboardRecording {
  id: string;
  patient_id: string | null;
  label: string | null;
  clinic_name: string | null;
  duration_seconds: number | null;
  doctor_name: string;
  status: RecordingStatus;
  recorded_at: string;
  has_pdf: boolean;
  pdf_generated_at: string | null;
  pdf_version: string | null;
  pdf_signed_url: string | null;
  can_edit: boolean;
}

export interface DashboardClinicContext {
  id: string;
  name: string;
  code: string;
  address: string | null;
}

export interface DashboardSnapshot {
  doctor: Doctor;
  clinic: DashboardClinicContext | null;
  pending_approvals_count: number;
  records: DashboardRecording[];
}

export interface RecordingDetail {
  id: string;
  patient_id: string | null;
  label: string | null;
  duration_seconds: number | null;
  doctor_name: string;
  can_edit: boolean;
  status: RecordingStatus;
  recorded_at: string;
  transcript: string | null;
  summary: string | null;
  has_pdf: boolean;
  pdf_generated_at: string | null;
  pdf_version: string | null;
  pdf_signed_url: string | null;
}

export interface RecordingDetailBootstrap {
  doctor: Doctor;
  recording: RecordingDetail;
}

export interface CreateRecordingRow {
  id: string;
  doctorId: string;
  clinicId: string;
  patientId: string | null;
  label: string | null;
  durationSeconds: number;
  recordedAt: string;
}

export interface RecordingsRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  findClinicById(clinicId: string): Promise<Clinic | null>;
  countPendingJoinRequests(clinicId: string): Promise<number>;
  listRecentClinicRecordings(clinicId: string, limit: number): Promise<RecordingListItem[]>;
  searchPatientRecordings(clinicId: string, patientId: string, limit: number): Promise<RecordingListItem[]>;
  createRecording(input: CreateRecordingRow): Promise<RecordingListItem>;
  findRecordingForClinic(recordingId: string, clinicId: string): Promise<RecordingListItem | null>;
  findRecordingForDoctor(recordingId: string, doctorId: string): Promise<RecordingListItem | null>;
  updateRecordingSummary(input: {
    recordingId: string;
    doctorId: string;
    summary: string;
    expectedTranscript: string;
  }): Promise<RecordingListItem>;
  deleteRecordingForDoctor(recordingId: string, doctorId: string): Promise<RecordingListItem | null>;
  removeRecordingStorageObjects(input: {
    audioStoragePath: string | null;
    pdfStoragePath: string | null;
  }): Promise<void>;
  createPdfSignedUrl(path: string): Promise<string>;
}

function toDashboardClinicContext(clinic: Clinic): DashboardClinicContext {
  return {
    id: clinic.id,
    name: clinic.name,
    code: clinic.clinic_code,
    address: clinic.address
  };
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(limit), 1), 50);
}

function requireClinicId(doctor: Doctor): string {
  if (!doctor.clinic_id) {
    throw new AppError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  }

  return doctor.clinic_id;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function pdfMetadataFor(recording: RecordingListItem): Pick<
  DashboardRecording,
  "has_pdf" | "pdf_generated_at" | "pdf_version"
> {
  const hasPdf = Boolean(recording.pdf_storage_path);

  return {
    has_pdf: hasPdf,
    pdf_generated_at: hasPdf ? recording.pdf_generated_at : null,
    pdf_version: hasPdf ? recording.pdf_version : null
  };
}

function requireSearchPatientId(patientId: string | null | undefined): string {
  const normalized = normalizePatientId(patientId ?? "");

  if (!normalized) {
    throw new AppError(400, "Patient ID is required.", "PATIENT_ID_REQUIRED");
  }

  return normalized;
}

function requireRecordingId(recordingId: string | null | undefined): string {
  const trimmed = recordingId?.trim();

  if (!trimmed) {
    throw new AppError(400, "Recording ID is required.", "RECORDING_ID_REQUIRED");
  }

  return trimmed;
}

function requireWorkflowPatientId(patientId: string | null | undefined): string {
  try {
    return requirePatientId(patientId);
  } catch {
    throw new AppError(400, "Patient ID is required.", "PATIENT_ID_REQUIRED");
  }
}

function requireTranscript(transcript: string | null | undefined): string {
  const trimmed = transcript?.trim();

  if (!trimmed) {
    throw new AppError(400, "Transcript is required before summary editing.", "TRANSCRIPT_REQUIRED");
  }

  return trimmed;
}

function requireSummary(summary: string | null | undefined): string {
  const trimmed = summary?.trim();

  if (!trimmed) {
    throw new AppError(400, "Summary cannot be empty.", "SUMMARY_REQUIRED");
  }

  return trimmed;
}

async function requireActiveDoctorContext(user: VerifiedUser, repository: RecordingsRepository): Promise<Doctor> {
  const doctor = await repository.findDoctorByAuthUid(user.uid);

  if (!doctor) {
    throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  return assertActiveDoctor(doctor);
}

export function toDashboardRecording(
  recording: RecordingListItem,
  fallbackDoctorName: string,
  clinicName: string | null = null,
  pdfSignedUrl: string | null = null,
  currentDoctorId?: string
): DashboardRecording {
  return {
    id: recording.id,
    patient_id: recording.patient_id,
    label: recording.label,
    clinic_name: clinicName,
    duration_seconds: recording.duration_seconds,
    doctor_name: recording.doctor_name ?? fallbackDoctorName,
    status: recording.status,
    recorded_at: recording.recorded_at,
    ...pdfMetadataFor(recording),
    pdf_signed_url: pdfSignedUrl,
    can_edit: currentDoctorId ? recording.doctor_id === currentDoctorId : true
  };
}

export function toRecordingDetail(
  recording: RecordingListItem,
  fallbackDoctorName: string,
  pdfSignedUrl: string | null = null,
  currentDoctorId?: string
): RecordingDetail {
  return {
    id: recording.id,
    patient_id: recording.patient_id,
    label: recording.label,
    duration_seconds: recording.duration_seconds,
    doctor_name: recording.doctor_name ?? fallbackDoctorName,
    can_edit: currentDoctorId ? recording.doctor_id === currentDoctorId : true,
    status: recording.status,
    recorded_at: recording.recorded_at,
    transcript: recording.transcript,
    summary: recording.summary,
    ...pdfMetadataFor(recording),
    pdf_signed_url: pdfSignedUrl
  };
}

export async function listDashboardRecordingsForDoctor(
  user: VerifiedUser,
  repository: RecordingsRepository,
  limit?: number
): Promise<DashboardRecording[]> {
  const doctor = await requireActiveDoctorContext(user, repository);
  const clinicId = requireClinicId(doctor);

  const recordings = await repository.listRecentClinicRecordings(clinicId, clampLimit(limit, 10));
  return recordings.map((recording) => toDashboardRecording(recording, doctor.name, null, null, doctor.id));
}

export async function getDashboardSnapshotForUser(
  user: VerifiedUser,
  repository: RecordingsRepository,
  limit?: number
): Promise<DashboardSnapshot> {
  const doctor = await repository.findDoctorByAuthUid(user.uid);

  if (!doctor) {
    throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  if (doctor.account_status !== "active") {
    return { doctor, clinic: null, pending_approvals_count: 0, records: [] };
  }

  const clinicId = requireClinicId(doctor);
  const [clinic, recordings, pendingApprovalsCount] = await Promise.all([
    repository.findClinicById(clinicId),
    repository.listRecentClinicRecordings(clinicId, clampLimit(limit, 10)),
    doctor.role === "owner" ? repository.countPendingJoinRequests(clinicId) : Promise.resolve(0)
  ]);

  return {
    doctor,
    clinic: clinic ? toDashboardClinicContext(clinic) : null,
    pending_approvals_count: pendingApprovalsCount,
    records: recordings.map((recording) =>
      toDashboardRecording(recording, doctor.name, clinic?.name ?? null, null, doctor.id)
    )
  };
}

export async function getRecordingDetailForDoctor(
  user: VerifiedUser,
  recordingId: string | null | undefined,
  repository: RecordingsRepository
): Promise<RecordingDetail> {
  const doctor = await requireActiveDoctorContext(user, repository);
  const clinicId = requireClinicId(doctor);
  const recording = await repository.findRecordingForClinic(requireRecordingId(recordingId), clinicId);

  if (!recording) {
    throw new AppError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  const pdfSignedUrl = recording.pdf_storage_path
    ? await repository.createPdfSignedUrl(recording.pdf_storage_path)
    : null;

  return toRecordingDetail(recording, doctor.name, pdfSignedUrl, doctor.id);
}

export async function getRecordingDetailBootstrapForDoctor(
  user: VerifiedUser,
  recordingId: string | null | undefined,
  repository: RecordingsRepository
): Promise<RecordingDetailBootstrap> {
  const doctor = await requireActiveDoctorContext(user, repository);
  const clinicId = requireClinicId(doctor);
  const recording = await repository.findRecordingForClinic(requireRecordingId(recordingId), clinicId);

  if (!recording) {
    throw new AppError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  const pdfSignedUrl = recording.pdf_storage_path
    ? await repository.createPdfSignedUrl(recording.pdf_storage_path)
    : null;

  return {
    doctor,
    recording: toRecordingDetail(recording, recording.doctor_name ?? doctor.name, pdfSignedUrl, doctor.id)
  };
}

export async function searchPatientRecordingsForClinic(
  user: VerifiedUser,
  patientId: string | null | undefined,
  repository: RecordingsRepository,
  limit?: number
): Promise<DashboardRecording[]> {
  const doctor = await requireActiveDoctorContext(user, repository);
  const clinicId = requireClinicId(doctor);
  const normalizedPatientId = requireSearchPatientId(patientId);
  const [clinic, recordings] = await Promise.all([
    repository.findClinicById(clinicId),
    repository.searchPatientRecordings(clinicId, normalizedPatientId, clampLimit(limit, 25))
  ]);
  const clinicName = clinic?.name ?? null;
  const recordsWithSignedPdfs = await Promise.all(
    recordings.map(async (recording) =>
      toDashboardRecording(
        recording,
        recording.doctor_name ?? doctor.name,
        clinicName,
        recording.pdf_storage_path ? await repository.createPdfSignedUrl(recording.pdf_storage_path) : null,
        doctor.id
      )
    )
  );

  return recordsWithSignedPdfs;
}

export async function saveRecordingSummaryForDoctor(
  user: VerifiedUser,
  recordingId: string | null | undefined,
  summary: string | null | undefined,
  repository: RecordingsRepository
): Promise<RecordingDetail> {
  const doctor = await requireActiveDoctorContext(user, repository);
  requireClinicId(doctor);
  const recording = await repository.findRecordingForDoctor(requireRecordingId(recordingId), doctor.id);

  if (!recording) {
    throw new AppError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  requireWorkflowPatientId(recording.patient_id);
  requireTranscript(recording.transcript);

  const updated = await repository.updateRecordingSummary({
    recordingId: recording.id,
    doctorId: doctor.id,
    summary: requireSummary(summary),
    expectedTranscript: recording.transcript!
  });

  return toRecordingDetail(updated, doctor.name, null, doctor.id);
}

export async function deleteRecordingForDoctor(
  user: VerifiedUser,
  recordingId: string | null | undefined,
  repository: RecordingsRepository
): Promise<{ recording_id: string }> {
  const doctor = await requireActiveDoctorContext(user, repository);
  requireClinicId(doctor);
  const deleted = await repository.deleteRecordingForDoctor(requireRecordingId(recordingId), doctor.id);

  if (!deleted) {
    throw new AppError(404, "Recording was not found.", "RECORDING_NOT_FOUND");
  }

  await repository.removeRecordingStorageObjects({
    audioStoragePath: deleted.audio_storage_path,
    pdfStoragePath: deleted.pdf_storage_path
  });

  return { recording_id: deleted.id };
}

export async function createRecordingMetadataForDoctor(
  user: VerifiedUser,
  input: unknown,
  repository: RecordingsRepository
): Promise<DashboardRecording> {
  const doctor = await requireActiveDoctorContext(user, repository);
  const clinicId = requireClinicId(doctor);
  const recordingInput = RecordingCreateSchema.parse(input);
  const durationSeconds = assertRecordingDuration(recordingInput.duration_seconds);
  const patientId = requireWorkflowPatientId(recordingInput.patient_id);
  const recording = await repository.createRecording({
    id: recordingInput.id,
    doctorId: doctor.id,
    clinicId,
    patientId,
    label: normalizeOptionalText(recordingInput.label),
    durationSeconds,
    recordedAt: recordingInput.recorded_at
  });

  return toDashboardRecording(recording, doctor.name);
}
