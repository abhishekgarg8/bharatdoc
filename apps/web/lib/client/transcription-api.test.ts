import { afterEach, describe, expect, it, vi } from "vitest";
import { audioFilenameExtension, transcribeRecordingAudio } from "@/lib/client/transcription-api";

describe("transcription api client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("posts audio form data directly to the Railway worker", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const fetcher = vi.fn(async () =>
      Response.json({
        recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        transcript: "Patient reports fever.",
        audio_storage_path: "clinic/doctor/recording.webm",
        status: "transcribed"
      })
    ) as unknown as typeof fetch;
    const audio = new Blob(["audio"], { type: "audio/webm" });

    await expect(
      transcribeRecordingAudio("id-token", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", audio, "audio/webm", fetcher)
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
    expect((vi.mocked(fetcher).mock.calls[0]?.[1]?.body as FormData).get("recording_id")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
  });

  it("throws when the transcription route fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const fetcher = vi.fn(async () => Response.json({ error: { code: "AUDIO_REQUIRED" } }, { status: 400 })) as unknown as typeof fetch;

    await expect(
      transcribeRecordingAudio(
        "id-token",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        new Blob(["audio"]),
        "audio/webm",
        fetcher
      )
    ).rejects.toThrow("Unable to transcribe recording.");
  });

  it("uses upload filenames that match supported audio MIME types", () => {
    expect(audioFilenameExtension("audio/webm")).toBe("webm");
    expect(audioFilenameExtension("audio/wav")).toBe("wav");
    expect(audioFilenameExtension("audio/x-wav")).toBe("wav");
    expect(audioFilenameExtension("audio/mp4")).toBe("m4a");
    expect(audioFilenameExtension("audio/ogg")).toBe("ogg");
  });

  it("fails fast when the public worker URL is missing", async () => {
    await expect(
      transcribeRecordingAudio(
        "id-token",
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        new Blob(["audio"]),
        "audio/webm",
        vi.fn() as unknown as typeof fetch
      )
    ).rejects.toThrow("Railway worker URL is not configured.");
  });
});
