import { describe, expect, it, vi } from "vitest";
import { transcribeRecordingAudio } from "@/lib/client/transcription-api";

describe("transcription api client", () => {
  it("posts audio form data to the recording transcription route", async () => {
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

    expect(fetcher).toHaveBeenCalledWith("/api/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/transcription", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      },
      body: expect.any(FormData)
    });
  });

  it("throws when the transcription route fails", async () => {
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
});
