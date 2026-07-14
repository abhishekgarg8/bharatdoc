import type { RecordingStatus } from "./constants.js";

export const PROCESSING_JOB_OPERATIONS = ["transcription", "summary", "pdf"] as const;
export const PROCESSING_JOB_STATES = [
  "queued",
  "running",
  "retry_wait",
  "succeeded",
  "failed_terminal",
  "cancel_requested",
  "cancelled"
] as const;
export const PROCESSING_JOB_TERMINAL_STATES = [
  "succeeded",
  "failed_terminal",
  "cancelled"
] as const;
export const PROCESSING_JOB_ACTIVE_STATES = [
  "queued",
  "running",
  "retry_wait",
  "cancel_requested"
] as const;
export const PROCESSING_JOB_RETRY_DEFAULTS = {
  maxAttempts: 3,
  baseDelaySeconds: 30,
  maxDelaySeconds: 15 * 60,
  staleLeaseSeconds: 10 * 60
} as const;

export type ProcessingJobOperation = (typeof PROCESSING_JOB_OPERATIONS)[number];
export type ProcessingJobLifecycleState = (typeof PROCESSING_JOB_STATES)[number];
export type ProcessingJobTerminalState = (typeof PROCESSING_JOB_TERMINAL_STATES)[number];
export type ProcessingJobActiveState = (typeof PROCESSING_JOB_ACTIVE_STATES)[number];

export const PROCESSING_JOB_TRANSITIONS = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "retry_wait", "failed_terminal", "cancel_requested"],
  retry_wait: ["running", "cancelled"],
  succeeded: [],
  failed_terminal: [],
  cancel_requested: ["succeeded", "failed_terminal", "cancelled"],
  cancelled: []
} as const satisfies Record<
  ProcessingJobLifecycleState,
  readonly ProcessingJobLifecycleState[]
>;

const terminalStates = new Set<ProcessingJobLifecycleState>(
  PROCESSING_JOB_TERMINAL_STATES
);
const activeStates = new Set<ProcessingJobLifecycleState>(
  PROCESSING_JOB_ACTIVE_STATES
);
const artifactRank: Record<RecordingStatus, number> = {
  recorded: 0,
  transcribed: 1,
  summary_ready: 2,
  pdf_saved: 3
};
const operationRank: Record<ProcessingJobOperation, number> = {
  transcription: 1,
  summary: 2,
  pdf: 3
};

export function isProcessingJobTerminalState(
  state: ProcessingJobLifecycleState
): state is ProcessingJobTerminalState {
  return terminalStates.has(state);
}

export function isProcessingJobActiveState(
  state: ProcessingJobLifecycleState
): state is ProcessingJobActiveState {
  return activeStates.has(state);
}

export function canTransitionProcessingJob(
  from: ProcessingJobLifecycleState,
  to: ProcessingJobLifecycleState
): boolean {
  const nextStates = PROCESSING_JOB_TRANSITIONS[
    from
  ] as readonly ProcessingJobLifecycleState[];
  return nextStates.includes(to);
}

export function assertProcessingJobTransition(
  from: ProcessingJobLifecycleState,
  to: ProcessingJobLifecycleState
): void {
  if (!canTransitionProcessingJob(from, to)) {
    throw new Error(`Illegal processing job transition: ${from} -> ${to}`);
  }
}

export function canRetryProcessingJob(
  attempt: number,
  maxAttempts = PROCESSING_JOB_RETRY_DEFAULTS.maxAttempts
): boolean {
  return (
    Number.isInteger(attempt) &&
    Number.isInteger(maxAttempts) &&
    attempt > 0 &&
    attempt < maxAttempts
  );
}

export function getProcessingJobRetryDelaySeconds(
  attempt: number,
  defaults = PROCESSING_JOB_RETRY_DEFAULTS
): number {
  const exponent = Math.max(0, Math.floor(attempt) - 1);
  return Math.min(defaults.maxDelaySeconds, defaults.baseDelaySeconds * 2 ** exponent);
}

export function requiredRecordingStatusForProcessingJob(
  operation: ProcessingJobOperation
): Exclude<RecordingStatus, "recorded"> {
  return operation === "transcription"
    ? "transcribed"
    : operation === "summary"
      ? "summary_ready"
      : "pdf_saved";
}

export function isProcessingArtifactOutcomeConsistent(
  operation: ProcessingJobOperation,
  state: ProcessingJobLifecycleState,
  recordingStatus: RecordingStatus
): boolean {
  return state !== "succeeded" || artifactRank[recordingStatus] >= operationRank[operation];
}

export const PROCESSING_JOB_SAFE_ERRORS = {
  PROCESSING_LEASE_EXPIRED: "The worker lease expired before processing completed.",
  PROCESSING_INPUT_CHANGED: "The recording changed before processing completed.",
  PROCESSING_OUTPUT_REPLACED: "A newer recording output replaced this result.",
  PROCESSING_ARTIFACT_SUPERSEDED: "The stored output changed and will be regenerated.",
  PROCESSING_CANCELLED: "Processing was cancelled.",
  PROCESSING_ATTEMPTS_EXHAUSTED:
    "Processing could not be completed after multiple attempts.",
  PROVIDER_RETRYABLE: "The processing provider is temporarily unavailable.",
  PROVIDER_TERMINAL: "The processing provider could not complete this job."
} as const;

export type ProcessingJobSafeErrorCode = keyof typeof PROCESSING_JOB_SAFE_ERRORS;

export interface ProcessingJobStatusDto {
  id: string;
  operation: ProcessingJobOperation;
  state: ProcessingJobLifecycleState;
  attempt: number;
  maxAttempts: number;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
  isStale: boolean;
  error: {
    code: ProcessingJobSafeErrorCode | "PROCESSING_FAILED";
    message: string;
  } | null;
}

type ProcessingJobStatusSource = Omit<ProcessingJobStatusDto, "error"> & {
  terminalErrorCode: string | null;
  terminalErrorMessage?: string | null;
  leaseToken?: string | null;
  leaseOwner?: string | null;
  result?: Record<string, unknown> | null;
  outputReference?: Record<string, unknown> | null;
};

export function toProcessingJobStatusDto(
  source: ProcessingJobStatusSource
): ProcessingJobStatusDto {
  const safeCode =
    source.terminalErrorCode &&
    source.terminalErrorCode in PROCESSING_JOB_SAFE_ERRORS
      ? (source.terminalErrorCode as ProcessingJobSafeErrorCode)
      : null;
  return {
    id: source.id,
    operation: source.operation,
    state: source.state,
    attempt: source.attempt,
    maxAttempts: source.maxAttempts,
    scheduledAt: source.scheduledAt,
    startedAt: source.startedAt,
    completedAt: source.completedAt,
    nextRetryAt: source.nextRetryAt,
    isStale: source.isStale,
    error: safeCode
      ? { code: safeCode, message: PROCESSING_JOB_SAFE_ERRORS[safeCode] }
      : source.terminalErrorCode
        ? { code: "PROCESSING_FAILED", message: "Processing could not be completed." }
        : null
  };
}
