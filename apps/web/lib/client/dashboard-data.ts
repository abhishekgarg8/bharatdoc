import type { Doctor, RecordingStatus } from "@bharatdoc/shared";
import { parseJsonOrThrow } from "@/lib/client/api-error";

export interface DashboardRecord {
  id: string;
  patientId: string;
  label?: string | null;
  clinicName?: string | null;
  time: string;
  duration: string;
  doctorName: string;
  status: RecordingStatus;
  recordedAt?: string;
  pdfStoragePath?: string | null;
  pdfSignedUrl?: string | null;
  offline?: boolean;
}

export interface DashboardApiRecord {
  id: string;
  patient_id: string | null;
  label: string | null;
  clinic_name?: string | null;
  duration_seconds: number | null;
  doctor_name: string;
  status: RecordingStatus;
  recorded_at: string;
  pdf_storage_path?: string | null;
  pdf_signed_url?: string | null;
}

export interface DashboardRecordListResponse {
  records: DashboardApiRecord[];
}

export interface DashboardSnapshotResponse {
  doctor: Doctor;
  clinic: {
    id: string;
    name: string;
    code: string;
    address: string | null;
  } | null;
  pending_approvals_count: number;
  records: DashboardApiRecord[];
}

export interface DashboardSnapshot {
  doctor: Doctor;
  clinic: DashboardSnapshotResponse["clinic"];
  pendingApprovalsCount: number;
  records: DashboardRecord[];
}

export interface CreateRecordingMetadataInput {
  id: string;
  patient_id: string | null;
  label?: string | null;
  duration_seconds: number;
  recorded_at: string;
}

export interface CreateRecordingMetadataResponse {
  record: DashboardApiRecord;
}

export interface LocalDashboardRecord extends DashboardRecord {
  recordedAt: string;
  offline: true;
}

export const demoDashboardRecords: DashboardRecord[] = [
  {
    id: "local-p-10482",
    patientId: "P-10482",
    time: "Today, 11:42",
    duration: "8:14",
    doctorName: "You",
    status: "recorded",
    offline: true
  },
  {
    id: "p-10481",
    patientId: "P-10481",
    time: "Today, 10:55",
    duration: "12:03",
    doctorName: "You",
    status: "transcribed"
  },
  {
    id: "p-10478",
    patientId: "P-10478",
    time: "Today, 09:30",
    duration: "6:47",
    doctorName: "You",
    status: "summary_ready"
  },
  {
    id: "p-10470",
    patientId: "P-10470",
    time: "Yest, 18:20",
    duration: "14:22",
    doctorName: "Dr. Rao",
    status: "pdf_saved"
  }
];

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatRecordedAt(recordedAt: string, now = new Date()): string {
  const date = new Date(recordedAt);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  const daysAgo = Math.round((startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) / 86_400_000);
  const clock = formatClock(date);

  if (daysAgo === 0) {
    return `Today, ${clock}`;
  }

  if (daysAgo === 1) {
    return `Yest, ${clock}`;
  }

  const dayLabel = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short"
  }).format(date);

  return `${dayLabel}, ${clock}`;
}

export function formatRecordingDuration(durationSeconds: number | null): string {
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) {
    return "--";
  }

  const totalSeconds = Math.max(0, Math.floor(durationSeconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }

  return `${minutes}:${seconds}`;
}

export function mapApiRecordingToDashboardRecord(record: DashboardApiRecord, now = new Date()): DashboardRecord {
  return {
    id: record.id,
    patientId: record.patient_id ?? record.label ?? "Unassigned",
    label: record.label,
    clinicName: record.clinic_name ?? null,
    time: formatRecordedAt(record.recorded_at, now),
    duration: formatRecordingDuration(record.duration_seconds),
    doctorName: record.doctor_name,
    status: record.status,
    recordedAt: record.recorded_at,
    pdfStoragePath: record.pdf_storage_path ?? null,
    pdfSignedUrl: record.pdf_signed_url ?? null
  };
}

function timestamp(record: DashboardRecord): number {
  const parsed = Date.parse(record.recordedAt ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeDashboardRecords(
  serverRecords: DashboardRecord[],
  localRecords: LocalDashboardRecord[] = []
): DashboardRecord[] {
  const seen = new Set<string>();
  const merged: DashboardRecord[] = [];

  for (const record of [...serverRecords, ...localRecords]) {
    if (seen.has(record.id)) {
      continue;
    }

    seen.add(record.id);
    merged.push(record);
  }

  return merged.sort((left, right) => timestamp(right) - timestamp(left));
}

export async function fetchDashboardRecords(idToken: string, fetcher: typeof fetch = fetch): Promise<DashboardRecord[]> {
  const response = await fetcher("/api/recordings", {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  const payload = await parseJsonOrThrow<DashboardRecordListResponse>(response, "Unable to load recent recordings.");

  return payload.records.map((record) => mapApiRecordingToDashboardRecord(record));
}

export async function fetchDashboardSnapshot(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<DashboardSnapshot> {
  const response = await fetcher("/api/dashboard", {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  const payload = await parseJsonOrThrow<DashboardSnapshotResponse>(response, "Unable to load dashboard.");

  return {
    doctor: payload.doctor,
    clinic: payload.clinic ?? null,
    pendingApprovalsCount: payload.pending_approvals_count ?? 0,
    records: payload.records.map((record) => mapApiRecordingToDashboardRecord(record))
  };
}

export async function createRecordingMetadata(
  idToken: string,
  input: CreateRecordingMetadataInput,
  fetcher: typeof fetch = fetch
): Promise<DashboardRecord> {
  const response = await fetcher("/api/recordings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const payload = await parseJsonOrThrow<CreateRecordingMetadataResponse>(response, "Unable to save recording metadata.");

  return mapApiRecordingToDashboardRecord(payload.record);
}

export async function searchPatientRecords(
  idToken: string,
  patientId: string,
  fetcher: typeof fetch = fetch
): Promise<DashboardRecord[]> {
  const params = new URLSearchParams({ patient_id: patientId });
  const response = await fetcher(`/api/patients/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });
  const payload = await parseJsonOrThrow<DashboardRecordListResponse>(response, "Unable to search patient records.");

  return payload.records.map((record) => mapApiRecordingToDashboardRecord(record));
}
