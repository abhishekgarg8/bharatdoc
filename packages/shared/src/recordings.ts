import { MAX_RECORDING_SECONDS, type RecordingStatus } from "./constants.js";

export const LOCAL_RECORDING_CAPTURE_STATES = [
  "idle",
  "recording",
  "paused",
  "stopped",
  "transcribing",
  "transcribed",
  "failed"
] as const;

export type LocalRecordingCaptureState = (typeof LOCAL_RECORDING_CAPTURE_STATES)[number];

const RECORDING_STATUS_ORDER: Record<RecordingStatus, number> = {
  recorded: 0,
  transcribed: 1,
  summary_ready: 2,
  pdf_saved: 3
};

const LOCAL_RECORDING_TRANSITIONS: Record<LocalRecordingCaptureState, LocalRecordingCaptureState[]> = {
  idle: ["recording"],
  recording: ["paused", "stopped", "failed"],
  paused: ["recording", "stopped", "failed"],
  stopped: ["transcribing", "failed"],
  transcribing: ["transcribed", "failed"],
  transcribed: [],
  failed: ["recording"]
};

export function canTransitionRecordingStatus(from: RecordingStatus, to: RecordingStatus): boolean {
  return RECORDING_STATUS_ORDER[to] >= RECORDING_STATUS_ORDER[from];
}

export function canTransitionLocalRecordingState(
  from: LocalRecordingCaptureState,
  to: LocalRecordingCaptureState
): boolean {
  return LOCAL_RECORDING_TRANSITIONS[from].includes(to);
}

export function assertLocalRecordingTransition(
  from: LocalRecordingCaptureState,
  to: LocalRecordingCaptureState
): LocalRecordingCaptureState {
  if (!canTransitionLocalRecordingState(from, to)) {
    throw new Error(`Invalid local recording transition from ${from} to ${to}.`);
  }

  return to;
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
