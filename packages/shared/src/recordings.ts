import { MAX_RECORDING_SECONDS, type RecordingStatus } from "./constants.js";

const RECORDING_STATUS_ORDER: Record<RecordingStatus, number> = {
  recorded: 0,
  transcribed: 1,
  summary_ready: 2,
  pdf_saved: 3
};

export function canTransitionRecordingStatus(from: RecordingStatus, to: RecordingStatus): boolean {
  return RECORDING_STATUS_ORDER[to] >= RECORDING_STATUS_ORDER[from];
}

export function assertRecordingDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error("Recording duration must be a non-negative finite number.");
  }

  if (seconds > MAX_RECORDING_SECONDS) {
    throw new Error("Recording duration exceeds the 60 minute Phase 1 limit.");
  }

  return Math.floor(seconds);
}

export function normalizePatientId(patientId: string): string {
  return patientId.trim().replace(/\s+/g, "").toUpperCase();
}

export function requirePatientId(patientId: string | null | undefined): string {
  const normalized = normalizePatientId(patientId ?? "");

  if (!normalized) {
    throw new Error("Patient ID is required.");
  }

  return normalized;
}
