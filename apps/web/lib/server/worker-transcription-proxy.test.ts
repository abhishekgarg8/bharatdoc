import { describe, expect, it, vi } from "vitest";
import { proxyTranscriptionRequest } from "@/lib/server/worker-transcription-proxy";

describe("worker transcription proxy", () => {
  it("forwards audio transcription requests to the Railway worker", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        transcript: "Patient reports fever.",
        audio_storage_path: "clinic/doctor/recording.webm",
        status: "transcribed"
      })
    ) as unknown as typeof fetch;

    await expect(
      proxyTranscriptionRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com/",
        audio: new Blob(["audio"], { type: "audio/webm" }),
        filename: "recording.webm",
        fetcher
      })
    ).resolves.toMatchObject({
      transcript: "Patient reports fever.",
      status: "transcribed"
    });

    expect(fetcher).toHaveBeenCalledWith("https://worker.example.com/api/transcribe", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      },
      body: expect.any(FormData)
    });
  });

  it("validates recording ids and audio before forwarding", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      proxyTranscriptionRequest({
        recordingId: "  ",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com",
        audio: new Blob(["audio"], { type: "audio/webm" }),
        fetcher
      })
    ).rejects.toMatchObject({ code: "RECORDING_ID_REQUIRED" });

    await expect(
      proxyTranscriptionRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com",
        audio: new Blob([], { type: "audio/webm" }),
        fetcher
      })
    ).rejects.toMatchObject({ code: "AUDIO_REQUIRED" });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("maps worker errors into app errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "PATIENT_ID_REQUIRED" } }, { status: 400 })
    ) as unknown as typeof fetch;

    await expect(
      proxyTranscriptionRequest({
        recordingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        bearerToken: "id-token",
        workerBaseUrl: "https://worker.example.com",
        audio: new Blob(["audio"], { type: "audio/webm" }),
        fetcher
      })
    ).rejects.toMatchObject({
      status: 400,
      code: "PATIENT_ID_REQUIRED"
    });
  });
});
