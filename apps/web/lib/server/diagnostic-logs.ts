import { assertActiveDoctor, assertOwner, normalizePatientId, type Doctor } from "@bharatdoc/shared";
import { z } from "zod";
import type { VerifiedUser } from "@/lib/server/auth";
import { AppError, toAppError } from "@/lib/server/errors";

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const DeviceLogEventSchema = z.enum([
  "recording.capture_started",
  "recording.capture_start_failed",
  "recording.capture_stopped",
  "recording.capture_stop_failed",
  "recording.metadata_synced",
  "recording.transcription_started",
  "recording.transcription_succeeded",
  "recording.transcription_failed",
  "recording.detail_transcription_started",
  "recording.detail_transcription_succeeded",
  "recording.detail_transcription_failed"
]);
const DeviceLogEntrySchema = z.object({
  id: z.string().min(1).max(120),
  level: LogLevelSchema,
  event: z.string().min(1).max(120),
  message: z.string().max(500).nullish(),
  recordingId: z.string().max(120).nullish(),
  patientId: z.string().max(120).nullish(),
  requestId: z.string().max(120).nullish(),
  sessionId: z.string().max(120).nullish(),
  deviceId: z.string().max(120).nullish(),
  appVersion: z.string().max(120).nullish(),
  userAgent: z.string().max(500).nullish(),
  url: z.string().max(1000).nullish(),
  createdAt: z.string().datetime().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const DeviceLogBatchSchema = z.object({
  device_id: z.string().min(1).max(120),
  session_id: z.string().min(1).max(120),
  logs: z.array(DeviceLogEntrySchema).min(1).max(100)
});

export type DeviceLogBatch = z.infer<typeof DeviceLogBatchSchema>;
export type DeviceLogLevel = z.infer<typeof LogLevelSchema>;

export interface DiagnosticLogRow {
  source: "device" | "web" | "worker";
  level: DeviceLogLevel;
  event: string;
  message: string | null;
  doctor_id: string | null;
  clinic_id: string | null;
  recording_id: string | null;
  patient_id: string | null;
  request_id: string | null;
  session_id: string | null;
  device_id: string | null;
  app_version: string | null;
  user_agent: string | null;
  url: string | null;
  client_created_at: string | null;
  metadata: Record<string, unknown>;
  created_at?: string | null;
}

export interface DiagnosticLogView {
  source: DiagnosticLogRow["source"];
  level: DeviceLogLevel;
  event: string;
  doctor_id: string | null;
  recording_id: string | null;
  client_created_at: string | null;
  created_at: string | null;
}

export interface DiagnosticLogListFilters {
  recordingId?: string | null;
  patientId?: string | null;
  deviceId?: string | null;
  limit?: number;
}

export interface DiagnosticLogRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  insertLogs(rows: DiagnosticLogRow[]): Promise<void>;
  listLogsForClinic(clinicId: string, filters: DiagnosticLogListFilters): Promise<DiagnosticLogView[]>;
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function optionalText(value: string | null | undefined, maxLength = 500): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

const SafeBooleanMetadataKeys = new Set(["can_edit", "has_transcript", "local_audio_available", "online"]);
const SafeNumberMetadataKeys = new Set(["audio_size_bytes", "duration_seconds", "transcript_chars"]);
const SafeRecordingStatuses = new Set(["recorded", "transcribed", "summary_ready", "pdf_saved"]);

function safeMetadata(value: Record<string, unknown> | undefined, clientLogId: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (isUuid(clientLogId)) metadata.client_log_id = clientLogId;

  for (const [key, candidate] of Object.entries(value ?? {})) {
    if (SafeBooleanMetadataKeys.has(key) && typeof candidate === "boolean") metadata[key] = candidate;
    if (SafeNumberMetadataKeys.has(key) && typeof candidate === "number" && Number.isFinite(candidate)) {
      metadata[key] = candidate;
    }
    if (key === "audio_mime_type" && typeof candidate === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(candidate)) {
      metadata[key] = candidate;
    }
    if (key === "status" && typeof candidate === "string" && SafeRecordingStatuses.has(candidate)) {
      metadata[key] = candidate;
    }
  }

  return metadata;
}

function safeDeviceLogEvent(event: string): string {
  return DeviceLogEventSchema.safeParse(event).data ?? "diagnostic.unknown";
}

function requireDoctor(user: VerifiedUser, doctor: Doctor | null): Doctor {
  if (!doctor) {
    throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  if (doctor.firebase_uid !== user.uid) {
    throw new AppError(403, "Doctor profile does not match the authenticated user.", "CLINIC_SCOPE_REQUIRED");
  }

  return doctor;
}

function requireActiveDoctor(user: VerifiedUser, doctor: Doctor | null): Doctor {
  return assertActiveDoctor(requireDoctor(user, doctor));
}

function requireClinicId(doctor: Doctor): string {
  if (!doctor.clinic_id) {
    throw new AppError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  }

  return doctor.clinic_id;
}

function toDiagnosticRows(doctor: Doctor, batch: DeviceLogBatch): DiagnosticLogRow[] {
  return batch.logs.map((log) => {
    return {
      source: "device",
      level: log.level,
      event: safeDeviceLogEvent(log.event),
      message: null,
      doctor_id: doctor.id,
      clinic_id: doctor.clinic_id,
      recording_id: isUuid(log.recordingId) ? log.recordingId : null,
      patient_id: null,
      request_id: isUuid(log.requestId) ? log.requestId : null,
      session_id: isUuid(log.sessionId ?? batch.session_id) ? (log.sessionId ?? batch.session_id) : null,
      device_id: isUuid(log.deviceId ?? batch.device_id) ? (log.deviceId ?? batch.device_id) : null,
      app_version: /^(?:[a-f0-9]{7,40}|local)$/i.test(log.appVersion ?? "") ? log.appVersion! : null,
      user_agent: null,
      url: null,
      client_created_at: log.createdAt ?? null,
      metadata: safeMetadata(log.metadata, log.id)
    };
  });
}

function toDiagnosticLogView(log: DiagnosticLogView): DiagnosticLogView {
  return {
    source: log.source,
    level: log.level,
    event: safeDeviceLogEvent(log.event),
    doctor_id: log.doctor_id,
    recording_id: log.recording_id,
    client_created_at: log.client_created_at,
    created_at: log.created_at ?? null
  };
}

function safeListFilters(filters: DiagnosticLogListFilters): DiagnosticLogListFilters {
  const safe: DiagnosticLogListFilters = {};
  const recordingId = optionalText(filters.recordingId, 120);
  const patientId = optionalText(filters.patientId, 120);
  const deviceId = optionalText(filters.deviceId, 120);

  if (recordingId) safe.recordingId = recordingId;
  if (patientId) safe.patientId = normalizePatientId(patientId);
  if (deviceId) safe.deviceId = deviceId;
  if (typeof filters.limit === "number") safe.limit = filters.limit;

  return safe;
}

export async function ingestDeviceLogsForUser(
  user: VerifiedUser,
  input: unknown,
  repository: DiagnosticLogRepository
): Promise<{ accepted: number }> {
  const doctor = requireActiveDoctor(user, await repository.findDoctorByAuthUid(user.uid));
  requireClinicId(doctor);
  const batch = DeviceLogBatchSchema.parse(input);
  const rows = toDiagnosticRows(doctor, batch);

  await repository.insertLogs(rows);

  return { accepted: rows.length };
}

export async function listDiagnosticLogsForUser(
  user: VerifiedUser,
  filters: DiagnosticLogListFilters,
  repository: DiagnosticLogRepository
): Promise<DiagnosticLogView[]> {
  const doctor = assertOwner(requireDoctor(user, await repository.findDoctorByAuthUid(user.uid)));
  const clinicId = requireClinicId(doctor);
  const logs = await repository.listLogsForClinic(clinicId, safeListFilters(filters));

  return logs.map(toDiagnosticLogView);
}

export function apiErrorDiagnosticPayload(error: unknown): Record<string, unknown> {
  const appError = toAppError(error);

  return {
    error_code: appError.code,
    error_status: appError.status,
    error_name: error instanceof Error ? error.name : typeof error,
    error_message: appError.status >= 500 ? "Internal server error." : appError.message
  };
}
