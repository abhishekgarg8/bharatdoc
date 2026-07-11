import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleStructuredLogger } from "../logger.js";

afterEach(() => vi.restoreAllMocks());

describe("structured logger PHI boundary", () => {
  it("drops clinical identifiers and object paths while retaining operational correlation", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    consoleStructuredLogger.error("pipeline.failed", {
      request_id: "request-safe", recording_id: "record-secret", doctor_id: "doctor-secret",
      clinic_id: "clinic-secret", patient_id: "P-SECRET", audio_storage_path: "private/audio.webm",
      transcript: "clinical words", stage: "transcribe_audio", error_code: "UPSTREAM_ERROR",
      nested: {
        id: "generic-secret", recording_id: "nested-secret", authorization: "Bearer abc.def",
        url: "https://example.test/P-SECRET/recording-uuid?token=secret#x",
        path: "/api/recordings/3fb9431c-3d99-4073-8f6a-3e97c412643d"
      }
    });

    const entry = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(entry).toMatchObject({ request_id: "request-safe", stage: "transcribe_audio", error_code: "UPSTREAM_ERROR" });
    expect(JSON.stringify(entry)).not.toMatch(/record-secret|doctor-secret|clinic-secret|P-SECRET|private\/audio|clinical words/);
    expect(JSON.stringify(entry)).not.toMatch(/generic-secret|nested-secret|abc\.def|token=secret|P-SECRET|recording-uuid|3fb9431c/);
    expect(entry.nested.url).toBe("[REDACTED_URL]");
    expect(entry.nested.path).toBe("/api/recordings/[id]");
  });
});
