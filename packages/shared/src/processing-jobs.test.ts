import { describe, expect, it } from "vitest";
import {
  PROCESSING_JOB_ACTIVE_STATES,
  PROCESSING_JOB_RETRY_DEFAULTS,
  PROCESSING_JOB_STATES,
  PROCESSING_JOB_TERMINAL_STATES,
  PROCESSING_JOB_TRANSITIONS,
  assertProcessingJobTransition,
  canRetryProcessingJob,
  canTransitionProcessingJob,
  getProcessingJobRetryDelaySeconds,
  isProcessingArtifactOutcomeConsistent,
  isProcessingJobActiveState,
  isProcessingJobTerminalState,
  requiredRecordingStatusForProcessingJob,
  toProcessingJobStatusDto
} from "./processing-jobs.js";

describe("processing job lifecycle helpers", () => {
  it("enforces every legal and illegal state transition", () => {
    for (const from of PROCESSING_JOB_STATES) {
      for (const to of PROCESSING_JOB_STATES) {
        const nextStates = PROCESSING_JOB_TRANSITIONS[
          from
        ] as readonly (typeof PROCESSING_JOB_STATES)[number][];
        const legal = nextStates.includes(to);
        expect(canTransitionProcessingJob(from, to), `${from} -> ${to}`).toBe(
          legal
        );
        if (legal) {
          expect(() => assertProcessingJobTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertProcessingJobTransition(from, to)).toThrow(
            "Illegal processing job transition"
          );
        }
      }
    }
  });

  it("claims retries directly so one attempt is consumed exactly once", () => {
    expect(PROCESSING_JOB_TRANSITIONS.retry_wait).toEqual(["running", "cancelled"]);
    expect(canTransitionProcessingJob("retry_wait", "queued")).toBe(false);
  });

  it("classifies active and terminal states", () => {
    expect(
      PROCESSING_JOB_TERMINAL_STATES.filter(isProcessingJobTerminalState)
    ).toEqual(PROCESSING_JOB_TERMINAL_STATES);
    expect(
      PROCESSING_JOB_ACTIVE_STATES.filter(isProcessingJobActiveState)
    ).toEqual(PROCESSING_JOB_ACTIVE_STATES);
    expect(isProcessingJobActiveState("succeeded")).toBe(false);
    expect(isProcessingJobTerminalState("retry_wait")).toBe(false);
  });

  it("keeps retry policy deterministic", () => {
    expect(canRetryProcessingJob(1)).toBe(true);
    expect(canRetryProcessingJob(PROCESSING_JOB_RETRY_DEFAULTS.maxAttempts)).toBe(false);
    expect(canRetryProcessingJob(0)).toBe(false);
    expect(getProcessingJobRetryDelaySeconds(1)).toBe(30);
    expect(getProcessingJobRetryDelaySeconds(6)).toBe(900);
  });

  it("maps operations to successful artifact milestones", () => {
    expect(requiredRecordingStatusForProcessingJob("transcription")).toBe(
      "transcribed"
    );
    expect(requiredRecordingStatusForProcessingJob("summary")).toBe(
      "summary_ready"
    );
    expect(requiredRecordingStatusForProcessingJob("pdf")).toBe("pdf_saved");
    expect(
      isProcessingArtifactOutcomeConsistent(
        "transcription",
        "succeeded",
        "pdf_saved"
      )
    ).toBe(true);
    expect(
      isProcessingArtifactOutcomeConsistent(
        "summary",
        "succeeded",
        "transcribed"
      )
    ).toBe(false);
    expect(
      isProcessingArtifactOutcomeConsistent("pdf", "retry_wait", "summary_ready")
    ).toBe(true);
  });

  it("builds a PHI-safe status DTO without lease, result, output, or raw errors", () => {
    const dto = toProcessingJobStatusDto({
      id: "job-1",
      operation: "summary",
      state: "failed_terminal",
      attempt: 3,
      maxAttempts: 3,
      scheduledAt: "2026-07-10T10:00:00.000Z",
      startedAt: "2026-07-10T10:01:00.000Z",
      completedAt: "2026-07-10T10:02:00.000Z",
      nextRetryAt: null,
      isStale: false,
      terminalErrorCode: "PROVIDER_TERMINAL",
      terminalErrorMessage: "Patient John Doe transcript rejected by provider",
      leaseToken: "secret-lease",
      result: { patient_id: "P-SECRET" },
      outputReference: { storage_path: "clinic/doctor/P-SECRET.pdf" }
    });

    expect(dto.error).toEqual({
      code: "PROVIDER_TERMINAL",
      message: "The processing provider could not complete this job."
    });
    expect(JSON.stringify(dto)).not.toMatch(
      /John|P-SECRET|storage|lease|result/i
    );
  });

  it("normalizes unknown persisted errors to one stable safe error", () => {
    expect(
      toProcessingJobStatusDto({
        id: "job-2",
        operation: "pdf",
        state: "failed_terminal",
        attempt: 1,
        maxAttempts: 3,
        scheduledAt: "2026-07-10T10:00:00.000Z",
        startedAt: null,
        completedAt: "2026-07-10T10:02:00.000Z",
        nextRetryAt: null,
        isStale: false,
        terminalErrorCode: "PATIENT_JANE_DOE",
        terminalErrorMessage: "Jane Doe"
      }).error
    ).toEqual({
      code: "PROCESSING_FAILED",
      message: "Processing could not be completed."
    });
  });

  it("exposes stale state without exposing lease ownership", () => {
    const dto = toProcessingJobStatusDto({
      id: "job-3", operation: "transcription", state: "running", attempt: 1, maxAttempts: 3,
      scheduledAt: "2026-07-10T10:00:00.000Z", startedAt: "2026-07-10T10:01:00.000Z",
      completedAt: null, nextRetryAt: null, isStale: true, terminalErrorCode: null,
      leaseToken: "secret", leaseOwner: "worker-private"
    });
    expect(dto.isStale).toBe(true);
    expect(JSON.stringify(dto)).not.toMatch(/secret|worker-private|lease/i);
  });
});
