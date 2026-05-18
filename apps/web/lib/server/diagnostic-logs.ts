import { normalizePatientId, type Doctor } from "@bharatdoc/shared";
import { z } from "zod";
import type { VerifiedUser } from "@/lib/server/auth";
import { AppError, toAppError } from "@/lib/server/errors";

const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
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
  listLogsForClinic(clinicId: string, filters: DiagnosticLogListFilters): Promise<DiagnosticLogRow[]>;
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

function safeMetadata(value: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
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

function requireClinicId(doctor: Doctor): string {
  if (!doctor.clinic_id) {
    throw new AppError(403, "Doctor must belong to a hospital.", "CLINIC_REQUIRED");
  }

  return doctor.clinic_id;
}

function toDiagnosticRows(doctor: Doctor, batch: DeviceLogBatch): DiagnosticLogRow[] {
  return batch.logs.map((log) => {
    const metadata = safeMetadata(log.metadata);
    metadata.client_log_id = log.id;

    return {
      source: "device",
      level: log.level,
      event: log.event,
      message: optionalText(log.message),
      doctor_id: doctor.id,
      clinic_id: doctor.clinic_id,
      recording_id: isUuid(log.recordingId) ? log.recordingId : null,
      patient_id: optionalText(normalizePatientId(log.patientId ?? ""), 120),
      request_id: optionalText(log.requestId, 120),
      session_id: optionalText(log.sessionId ?? batch.session_id, 120),
      device_id: optionalText(log.deviceId ?? batch.device_id, 120),
      app_version: optionalText(log.appVersion, 120),
      user_agent: optionalText(log.userAgent, 500),
      url: optionalText(log.url, 1000),
      client_created_at: log.createdAt ?? null,
      metadata
    };
  });
}

export async function ingestDeviceLogsForUser(
  user: VerifiedUser,
  input: unknown,
  repository: DiagnosticLogRepository
): Promise<{ accepted: number }> {
  const doctor = requireDoctor(user, await repository.findDoctorByAuthUid(user.uid));
  const batch = DeviceLogBatchSchema.parse(input);
  const rows = toDiagnosticRows(doctor, batch);

  await repository.insertLogs(rows);

  return { accepted: rows.length };
}

export async function listDiagnosticLogsForUser(
  user: VerifiedUser,
  filters: DiagnosticLogListFilters,
  repository: DiagnosticLogRepository
): Promise<DiagnosticLogRow[]> {
  const doctor = requireDoctor(user, await repository.findDoctorByAuthUid(user.uid));
  const clinicId = requireClinicId(doctor);

  return repository.listLogsForClinic(clinicId, {
    ...filters,
    patientId: filters.patientId ? normalizePatientId(filters.patientId) : null
  });
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
