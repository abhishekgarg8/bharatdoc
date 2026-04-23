import { describe, expect, it, vi } from "vitest";
import {
  createRemoteRecordingMetadata,
  requestRecordingTranscription,
  transcribeLocalRecording
} from "@/lib/client/transcription-api";
import { buildLocalRecordingMetadata } from "@/lib/client/local-recordings";

function createRecording() {
  return buildLocalRecordingMetadata({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    patientId: "P-10483",
    label: "Follow-up",
    durationSeconds: 14,
    recordedAt: "2026-04-23T06:20:00.000Z",
    audioBlob: new Blob(["audio"], { type: "audio/webm" })
  });
}

describe("transcription API helpers", () => {
  it("creates remote recording metadata before transcription", async () => {
    const recording = createRecording();
    const fetcher = vi.fn(async () => Response.json({ record: { id: recording.id } }, { status: 201 })) as unknown as typeof fetch;

    await createRemoteRecordingMetadata("id-token", recording, fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/recordings", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        id: recording.id,
        patient_id: "P-10483",
        label: "Follow-up",
        duration_seconds: 14,
        recorded_at: "2026-04-23T06:20:00.000Z"
      })
    });
  });

  it("posts audio to the local transcription proxy", async () => {
    const recording = createRecording();
    const fetcher = vi.fn(async () =>
      Response.json({ recording_id: recording.id, transcript: "Patient reports fever." })
    );

    await expect(requestRecordingTranscription("id-token", recording, fetcher as unknown as typeof fetch)).resolves.toEqual({
      recording_id: recording.id,
      transcript: "Patient reports fever."
    });

    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    const [, init] = calls[0]!;
    expect(fetcher).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer id-token"
        }
      })
    );
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("recording_id")).toBe(recording.id);
    expect((init?.body as FormData).get("audio")).toBeInstanceOf(Blob);
  });

  it("does not post transcription without audio", async () => {
    const recording = buildLocalRecordingMetadata({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      durationSeconds: 14
    });
    const fetcher = vi.fn() as unknown as typeof fetch;

    await expect(requestRecordingTranscription("id-token", recording, fetcher)).rejects.toThrow(
      "Recording audio is required"
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sequences metadata creation before transcription", async () => {
    const recording = createRecording();
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (url === "/api/recordings") {
        return Response.json({ record: { id: recording.id } }, { status: 201 });
      }

      return Response.json({ recording_id: recording.id, transcript: "Transcript ready." });
    }) as unknown as typeof fetch;

    await expect(transcribeLocalRecording({ idToken: "id-token", recording }, fetcher)).resolves.toEqual({
      recording_id: recording.id,
      transcript: "Transcript ready."
    });
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/recordings", expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/transcribe", expect.any(Object));
  });
});
