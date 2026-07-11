import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendDeviceLog, clearDeviceLogs, flushDeviceLogs, listDeviceLogs } from "@/lib/client/device-logs";

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
      clear: vi.fn(() => {
        values.clear();
      })
    }
  });
}

describe("device logs", () => {
  beforeEach(() => {
    installLocalStorage();
    window.localStorage.clear();
  });

  it("stores device logs locally with stable device and session ids", () => {
    window.history.replaceState({}, "", "/search?patient_id=P-SECRET");
    const first = appendDeviceLog({
      level: "info",
      event: "recording.capture_started",
      patientId: " P-123 ",
      message: "Patient ID: 301748995 at https://example.test/search?patient_id=P-SECRET#result",
      metadata: {
        query: 301748995,
        source_url: "https://example.test/search?patient_id=P-SECRET#result",
        nested: { patient_id: 301748995, patientId: "RAW-2", mrn: 9911, uhid: "UH-7", "P-SECRET": true },
        duration_seconds: 42
      }
    });
    const second = appendDeviceLog({
      level: "error",
      event: "recording.transcription_failed",
      recordingId: "11111111-1111-4111-8111-111111111111"
    });

    expect(listDeviceLogs()).toHaveLength(2);
    expect(first.patientId).toBeNull();
    expect(second.recordingId).toBeNull();
    expect(JSON.stringify(second)).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(second.deviceId).toBe(first.deviceId);
    expect(second.sessionId).toBe(first.sessionId);
    expect(first.url).toBe(`${window.location.origin}/search`);
    expect(JSON.stringify(first)).not.toContain("P-SECRET");
    expect(first.message).toBe("Patient ID: [REDACTED_PATIENT_ID] at https://example.test/search");
    expect(first.metadata).toMatchObject({
      query: "[REDACTED_PATIENT_ID]",
      source_url: "https://example.test/search",
      nested: {
        patient_id: "[REDACTED_PATIENT_ID]",
        patientId: "[REDACTED_PATIENT_ID]",
        mrn: "[REDACTED_PATIENT_ID]",
        uhid: "[REDACTED_PATIENT_ID]",
        "[REDACTED_PATIENT_ID]": true
      },
      duration_seconds: 42
    });
  });

  it("flushes local logs to the authenticated server endpoint", async () => {
    appendDeviceLog({
      level: "error",
      event: "recording.detail_transcription_failed",
      message: "Original audio is not available on this device."
    });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ accepted: 1 }), { status: 202 }));

    await expect(flushDeviceLogs({ idToken: "token", fetcher })).resolves.toBe(1);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/device-logs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "Content-Type": "application/json"
        })
      })
    );
    expect(listDeviceLogs()).toHaveLength(0);
  });

  it("keeps local logs when upload fails", async () => {
    appendDeviceLog({
      level: "warn",
      event: "diagnostics.flush_retry"
    });
    const fetcher = vi.fn(async () => new Response("nope", { status: 500 }));

    await expect(flushDeviceLogs({ idToken: "token", fetcher })).resolves.toBe(0);

    expect(listDeviceLogs()).toHaveLength(1);
  });

  it("clears device and session diagnostics on sign-out", () => {
    appendDeviceLog({ level: "info", event: "recording.capture_started", recordingId: "secret" });
    clearDeviceLogs();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith("bharatdoc-device-logs-v1");
    expect(listDeviceLogs()).toEqual([]);
  });
});
