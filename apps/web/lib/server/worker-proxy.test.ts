import { describe, expect, it, vi } from "vitest";
import { proxyTranscriptionRequest } from "@/lib/server/worker-proxy";

function transcriptionRequest({
  authorization = "Bearer id-token",
  recordingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  audio = new Blob(["audio"], { type: "audio/webm" })
}: {
  authorization?: string | null;
  recordingId?: string | null;
  audio?: Blob | null;
} = {}) {
  const body = new FormData();

  if (recordingId !== null) {
    body.set("recording_id", recordingId);
  }

  if (audio !== null) {
    body.set("audio", audio, "recording.webm");
  }

  const headers = new Headers();

  if (authorization !== null) {
    headers.set("Authorization", authorization);
  }

  return {
    body,
    request: new Request("http://localhost/api/transcribe", {
      method: "POST",
      headers
    })
  };
}

describe("worker transcription proxy", () => {
  it("rejects missing authorization before forwarding", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(
      proxyTranscriptionRequest(transcriptionRequest({ authorization: null }).request, {
        workerBaseUrl: "https://worker.example.com",
        fetcher
      })
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires a recording id and audio file", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const missingRecordingId = transcriptionRequest({ recordingId: null });
    const missingAudio = transcriptionRequest({ audio: null });

    await expect(
      proxyTranscriptionRequest(missingRecordingId.request, {
        workerBaseUrl: "https://worker.example.com",
        fetcher,
        readFormData: async () => missingRecordingId.body
      })
    ).rejects.toMatchObject({ code: "RECORDING_ID_REQUIRED" });
    await expect(
      proxyTranscriptionRequest(missingAudio.request, {
        workerBaseUrl: "https://worker.example.com",
        fetcher,
        readFormData: async () => missingAudio.body
      })
    ).rejects.toMatchObject({ code: "AUDIO_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards valid transcription requests to the Railway worker", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", transcript: "Transcript ready." })
    );
    const request = transcriptionRequest();

    await expect(
      proxyTranscriptionRequest(request.request, {
        workerBaseUrl: "https://worker.example.com/root",
        fetcher: fetcher as unknown as typeof fetch,
        readFormData: async () => request.body
      })
    ).resolves.toEqual({
      recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      transcript: "Transcript ready."
    });

    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    const [url, init] = calls[0]!;
    expect(url).toBe("https://worker.example.com/api/transcribe");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("recording_id")).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect((init?.body as FormData).get("audio")).toBeInstanceOf(Blob);
  });

  it("reports worker transcription failures with a stable code", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { code: "OPENAI_ERROR" } }, { status: 502 })) as unknown as typeof fetch;
    const request = transcriptionRequest();

    await expect(
      proxyTranscriptionRequest(request.request, {
        workerBaseUrl: "https://worker.example.com",
        fetcher,
        readFormData: async () => request.body
      })
    ).rejects.toMatchObject({
      code: "WORKER_TRANSCRIPTION_FAILED",
      status: 502
    });
  });
});
