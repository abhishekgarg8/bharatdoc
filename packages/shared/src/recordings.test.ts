import { describe, expect, it } from "vitest";
import {
  assertRecordingDuration,
  canTransitionRecordingStatus,
  normalizePatientId,
  requirePatientId
} from "./recordings.js";

describe("recording lifecycle helpers", () => {
  it("allows forward status transitions and idempotent updates", () => {
    expect(canTransitionRecordingStatus("recorded", "transcribed")).toBe(true);
    expect(canTransitionRecordingStatus("summary_ready", "summary_ready")).toBe(true);
    expect(canTransitionRecordingStatus("pdf_saved", "recorded")).toBe(false);
  });

  it("normalizes patient IDs for clinic search", () => {
    expect(normalizePatientId(" p-10482 ")).toBe("P-10482");
    expect(normalizePatientId(" p 10482 ")).toBe("P10482");
  });

  it("requires patient IDs before transcription or PDF generation", () => {
    expect(requirePatientId(" p-10482 ")).toBe("P-10482");
    expect(() => requirePatientId(" ")).toThrow("Patient ID is required.");
  });

  it("enforces the 60 minute Phase 1 limit", () => {
    expect(assertRecordingDuration(59.8)).toBe(59);
    expect(() => assertRecordingDuration(3601)).toThrow("60 minute");
  });
});
