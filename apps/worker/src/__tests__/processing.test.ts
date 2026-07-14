import { describe, expect, it, vi } from "vitest";
import {
  pdfProcessingInputHash,
  processingIdempotencyKey,
  reconcileProcessingArtifacts,
  validateTranscriptionManifest,
  type TranscriptionChunkInput
} from "../processing.js";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";

function chunks(): TranscriptionChunkInput[] {
  return [
    { index: 0, count: 2, bytes: 3, durationSeconds: 6, checksum: "a".repeat(64) },
    { index: 1, count: 2, bytes: 2, durationSeconds: 4, checksum: "b".repeat(64) }
  ];
}

describe("AI processing controls", () => {
  it("derives bounded stable logical-operation keys", () => {
    expect(processingIdempotencyKey(" summary ", "recording-1", "same input")).toBe(
      processingIdempotencyKey("summary", "recording-1", "same input")
    );
    expect(processingIdempotencyKey("summary", "recording-1", "new input")).not.toBe(
      processingIdempotencyKey("summary", "recording-1", "same input")
    );
    expect(processingIdempotencyKey("summary", "recording-1", "same input").length).toBeLessThanOrEqual(120);
  });

  it("fingerprints every PDF render input with a deterministic generation time", () => {
    const clinic = { clinic_code: "ABC234", name: "Clinic", address: "Address" } as Clinic;
    const doctor = { name: "Doctor", specialization: "Medicine" } as Doctor;
    const recording = { summary: "Summary", patient_id: "P-1", recorded_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:01:00Z" } as Recording;
    const fingerprint = pdfProcessingInputHash({ clinic, doctor, recording });
    expect(pdfProcessingInputHash({ clinic, doctor, recording })).toBe(fingerprint);
    expect(pdfProcessingInputHash({ clinic: { ...clinic, name: "Other" }, doctor, recording })).not.toBe(fingerprint);
    expect(pdfProcessingInputHash({ clinic, doctor: { ...doctor, name: "Other" }, recording })).not.toBe(fingerprint);
    expect(pdfProcessingInputHash({ clinic, doctor, recording: { ...recording, patient_id: "P-2" } })).not.toBe(fingerprint);
  });

  it("accepts one contiguous immutable manifest with exact aggregate totals", () => {
    expect(
      validateTranscriptionManifest(chunks(), {
        expectedBytes: 5,
        expectedDurationSeconds: 10,
        maxBytes: 10,
        maxDurationSeconds: 60,
        maxChunks: 8
      })
    ).toEqual(chunks());
  });

  it.each([
    ["count", [{ ...chunks()[0]!, count: 3 }, chunks()[1]!]],
    ["continuity", [chunks()[1]!, chunks()[0]!]],
    ["bytes", [{ ...chunks()[0]!, bytes: 4 }, chunks()[1]!]],
    ["duration", [{ ...chunks()[0]!, durationSeconds: 7 }, chunks()[1]!]],
    ["checksum", [{ ...chunks()[0]!, checksum: "invalid" }, chunks()[1]!]]
  ])("rejects invalid %s metadata", (_case, manifest) => {
    expect(() =>
      validateTranscriptionManifest(manifest as TranscriptionChunkInput[], {
        expectedBytes: 5,
        expectedDurationSeconds: 10,
        maxBytes: 10,
        maxDurationSeconds: 60,
        maxChunks: 8
      })
    ).toThrow();
  });

  it("rejects unbounded chunk count, aggregate bytes, and duration", () => {
    expect(() =>
      validateTranscriptionManifest(chunks(), {
        expectedBytes: 5,
        expectedDurationSeconds: 10,
        maxBytes: 4,
        maxDurationSeconds: 60,
        maxChunks: 8
      })
    ).toThrow();
    expect(() =>
      validateTranscriptionManifest(chunks(), {
        expectedBytes: 5,
        expectedDurationSeconds: 10,
        maxBytes: 10,
        maxDurationSeconds: 9,
        maxChunks: 8
      })
    ).toThrow();
    expect(() =>
      validateTranscriptionManifest(chunks(), {
        expectedBytes: 5,
        expectedDurationSeconds: 10,
        maxBytes: 10,
        maxDurationSeconds: 60,
        maxChunks: 1
      })
    ).toThrow();
  });

  it("retries bounded artifact cleanup after a transient storage failure", async () => {
    const repository = {
      claimCleanupArtifacts: vi.fn(async () => [{ kind: "pdf" as const, storagePath: "old.pdf", cleanupToken: "token" }]),
      completeArtifactCleanup: vi.fn(async () => undefined),
      releaseArtifactCleanup: vi.fn(async () => undefined)
    } as unknown as import("../types.js").ProcessingJobRepository;
    const remove = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(undefined);
    const storage = { pdfStorage: { deleteRecordingPdf: remove } as never };

    await expect(reconcileProcessingArtifacts(repository, storage)).resolves.toBe(0);
    expect(repository.completeArtifactCleanup).not.toHaveBeenCalled();
    expect(repository.releaseArtifactCleanup).toHaveBeenCalledOnce();
    await expect(reconcileProcessingArtifacts(repository, storage)).resolves.toBe(1);
    expect(repository.completeArtifactCleanup).toHaveBeenCalledWith({
      kind: "pdf", storagePath: "old.pdf", cleanupToken: "token"
    });
  });
});
