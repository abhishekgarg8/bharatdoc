import {
  assertActiveDoctor,
  assertRecordingDuration,
  normalizePatientId,
  requirePatientId,
  RecordingCreateSchema,
  type Doctor,
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
  duration_seconds: number | null;
  doctor_name: string;
  status: RecordingStatus;
  recorded_at: string;
}

export interface RecordingDetail {
  id: string;
  patient_id: string | null;
  label: string | null;
  duration_seconds: number | null;
  doctor_name: string;
  status: RecordingStatus;
  recorded_at: string;
  transcript: string | null;
  summary: string | null;
  pdf_storage_path: string | null;
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
  listRecentRecordings(doctorId: string, limit: number): Promise<RecordingListItem[]>;
  searchPatientRecordings(clinicId: string, patientId: string, limit: number): Promise<RecordingListItem[]>;
  createRecording(input: CreateRecordingRow): Promise<RecordingListItem>;
  findRecordingForClinic(recordingId: string, clinicId: string): Promise<RecordingListItem | null>;
  findRecordingForDoctor(recordingId: string, doctorId: string): Promise<RecordingListItem | null>;
  updateRecordingSummary(input: {
    recordingId: string;
    doctorId: string;
    summary: string;
  }): Promise<RecordingListItem>;
}

function clampLimit(limit: number | undefined, fallback: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(limit), 1), 50);
}

function requireClinicId(doctor: Doctor): string {
  if (!doctor.clinic_id) {
    throw new AppError(403, "Doctor must belong to a clinic.", "CLINIC_REQUIRED");
  }

  return doctor.clinic_id;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeOptionalPatientId(value: string | null | undefined): string | null {
  const normalized = normalizePatientId(value ?? "");
  return normalized ? normalized : null;
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

export function toDashboardRecording(recording: RecordingListItem, fallbackDoctorName: string): DashboardRecording {
  return {
    id: recording.id,
    patient_id: recording.patient_id,
    label: recording.label,
    duration_seconds: recording.duration_seconds,
    doctor_name: recording.doctor_name ?? fallbackDoctorName,
    status: recording.status,
    recorded_at: recording.recorded_at
  };
}

export function toRecordingDetail(recording: RecordingListItem, fallbackDoctorName: string): RecordingDetail {
  return {
    id: recording.id,
    patient_id: recording.patient_id,
    label: recording.label,
    duration_seconds: recording.duration_seconds,
    doctor_name: recording.doctor_name ?? fallbackDoctorName,
    status: recording.status,
    recorded_at: recording.recorded_at,
    transcript: recording.transcript,
    summary: recording.summary,
    pdf_storage_path: recording.pdf_storage_path
  };
}

export async function listDashboardRecordingsForDoctor(
  user: VerifiedUser,
  repository: RecordingsRepository,
  limit?: number
): Promise<DashboardRecording[]> {
  const doctor = await requireActiveDoctorContext(user, repository);
  requireClinicId(doctor);

  const recordings = await repository.listRecentRecordings(doctor.id, clampLimit(limit, 10));
  return recordings.map((recording) => toDashboardRecording(recording, doctor.name));
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

  return toRecordingDetail(recording, doctor.name);
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
  const recordings = await repository.searchPatientRecordings(clinicId, normalizedPatientId, clampLimit(limit, 25));

  return recordings.map((recording) => toDashboardRecording(recording, doctor.name));
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
    summary: requireSummary(summary)
  });

  return toRecordingDetail(updated, doctor.name);
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
  const recording = await repository.createRecording({
    id: recordingInput.id,
    doctorId: doctor.id,
    clinicId,
    patientId: normalizeOptionalPatientId(recordingInput.patient_id),
    label: normalizeOptionalText(recordingInput.label),
    durationSeconds,
    recordedAt: recordingInput.recorded_at
  });

  return toDashboardRecording(recording, doctor.name);
}
