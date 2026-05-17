import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingScreen } from "@/components/recordings/recording-screen";
import type { AudioRecorder, RecordedAudioChunk } from "@/lib/client/audio-recorder";
import { createMemoryLocalRecordingRepository } from "@/lib/client/local-recordings";

function createRecorder(overrides: Partial<AudioRecorder> = {}) {
  const listeners = new Set<(chunk: RecordedAudioChunk) => void | Promise<void>>();
  const recorder: AudioRecorder = {
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({
      blob: new Blob(["audio"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationSeconds: 42
    })),
    onChunk: vi.fn((listener: (chunk: RecordedAudioChunk) => void | Promise<void>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    ...overrides
  };

  return {
    recorder,
    async emitChunk(durationSeconds = 30) {
      const chunk: RecordedAudioChunk = {
        blob: new Blob([`audio-${durationSeconds}`], { type: "audio/webm" }),
        mimeType: "audio/webm",
        durationSeconds
      };

      for (const listener of listeners) {
        await listener(chunk);
      }
    }
  };
}

describe("RecordingScreen", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });

  it("shows clinic context and current online state", () => {
    render(<RecordingScreen clinicName="Sunrise Hospital" useDemoRecorder />);

    expect(screen.getByText("Sunrise Hospital · Online")).toBeInTheDocument();
    expect(screen.getByText("Audio stays on this device until transcription.")).toBeInTheDocument();
  });

  it("keeps recording available offline and waits for reconnect before authenticated transcription", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();

    render(
      <RecordingScreen
        idToken="id-token"
        clinicName="Sunrise Hospital"
        localRepository={repository}
        recorderFactory={async () => recorder}
      />
    );

    expect(screen.getByText("Sunrise Hospital · Offline")).toBeInTheDocument();
    expect(screen.getByText("Reconnect to transcribe; audio remains saved locally.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10482" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Recording saved on this device.");

    expect(screen.getByRole("button", { name: /transcribe/i })).toBeDisabled();
    expect((await repository.list())[0]).toMatchObject({
      patientId: "P-10482",
      captureState: "stopped",
      syncState: "local"
    });
  });

  it("records, stores chunks locally, and produces a demo transcript", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const { recorder, emitChunk } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: " p-10482 " } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));

    await expect(screen.findByText("Recording started.")).resolves.toBeInTheDocument();
    expect(recorder.start).toHaveBeenCalled();

    await act(async () => {
      await emitChunk(30);
    });
    expect((await repository.list())[0]).toMatchObject({
      patientId: "P-10482",
      durationSeconds: 30,
      captureState: "recording"
    });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await expect(screen.findByText("Recording saved on this device.")).resolves.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await expect(screen.findByText("Transcript ready.")).resolves.toBeInTheDocument();
    expect(screen.getByText(/I have had fever for two days/)).toBeInTheDocument();

    const records = await repository.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      patientId: "P-10482",
      durationSeconds: 42,
      captureState: "transcribed",
      syncState: "transcribed"
    });
    expect(records[0]!.audioChunks).toHaveLength(1);
  });

  it("pauses and resumes the active recorder while persisting capture state", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10482" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(recorder.pause).toHaveBeenCalled());
    expect((await repository.list())[0]).toMatchObject({ captureState: "paused" });

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(recorder.resume).toHaveBeenCalled());
    expect((await repository.list())[0]).toMatchObject({ captureState: "recording" });
  });

  it("recovers an interrupted chunked recording from local storage", async () => {
    const repository = createMemoryLocalRecordingRepository([
      {
        id: "recoverable",
        patientId: "P-10482",
        label: "Interrupted consult",
        durationSeconds: 30,
        recordedAt: "2026-04-23T06:12:00.000Z",
        updatedAt: "2026-04-23T06:42:00.000Z",
        audioBlob: null,
        audioChunks: [new Blob(["audio"], { type: "audio/webm" })],
        audioMimeType: "audio/webm",
        captureState: "recording",
        syncState: "local",
        serverRecordingId: null,
        transcript: null,
        error: null
      }
    ]);

    render(<RecordingScreen localRepository={repository} useDemoRecorder />);

    await expect(screen.findByText("Recovered an interrupted local recording.")).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Patient ID")).toHaveValue("P-10482");
    expect(screen.getByRole("button", { name: /transcribe/i })).toBeInTheDocument();
    expect((await repository.list())[0]).toMatchObject({ captureState: "stopped" });
  });

  it("saves stopped audio without Patient ID and blocks transcription until Patient ID is added", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await expect(screen.findByText("Recording saved on this device.")).resolves.toBeInTheDocument();
    expect((await repository.list())[0]).toMatchObject({
      patientId: null,
      captureState: "stopped"
    });
    expect((await repository.list())[0]!.audioBlob).toBeInstanceOf(Blob);

    expect(screen.getByRole("button", { name: /transcribe/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10483" } });
    expect(screen.getByRole("button", { name: /transcribe/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await expect(screen.findByText("Transcript ready.")).resolves.toBeInTheDocument();
    expect((await repository.list())[0]).toMatchObject({
      patientId: "P-10483",
      captureState: "transcribed",
      syncState: "transcribed"
    });
  });

  it("syncs authenticated recordings with Patient ID and navigates to the server detail page", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();
    const navigate = vi.fn();
    const apiRecord = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      patient_id: "P-10483",
      label: "Follow-up",
      duration_seconds: 42,
      doctor_name: "Dr. Aparna",
      status: "recorded",
      recorded_at: "2026-04-23T06:12:00.000Z"
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ record: apiRecord }, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json({
          recording_id: apiRecord.id,
          transcript: "Authenticated transcript.",
          audio_storage_path: "clinic/doctor/recording.webm",
          status: "transcribed"
        })
      ) as unknown as typeof fetch;

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher}
        localRepository={repository}
        recorderFactory={async () => recorder}
        onNavigate={navigate}
      />
    );

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: " p-10483 " } });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Follow-up" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Recording saved on this device.");
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/recordings/${apiRecord.id}`));
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/recordings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer id-token" })
      })
    );
    expect(JSON.parse(String(vi.mocked(fetcher).mock.calls[0]?.[1]?.body))).toMatchObject({
      patient_id: "P-10483",
      label: "Follow-up"
    });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://worker.example.com/api/transcribe",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer id-token" },
        body: expect.any(FormData)
      })
    );
  });

  it("does not call authenticated recording APIs when Patient ID is missing", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();
    const fetcher = vi.fn() as unknown as typeof fetch;

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher}
        localRepository={repository}
        recorderFactory={async () => recorder}
        onNavigate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Recording saved on this device.");

    expect(screen.getByRole("button", { name: /transcribe/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));

    expect(fetcher).not.toHaveBeenCalled();
    expect((await repository.list())[0]).toMatchObject({
      patientId: null,
      captureState: "stopped",
      syncState: "local"
    });
  });

  it("keeps local audio available for retry when authenticated transcription fails", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();
    const fetcher = vi.fn(async () => Response.json({ error: { code: "WORKER_DOWN" } }, { status: 502 })) as unknown as typeof fetch;

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher}
        localRepository={repository}
        recorderFactory={async () => recorder}
        onNavigate={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10482" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Recording saved on this device.");
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));

    await expect(screen.findByText("Unable to transcribe recording.")).resolves.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect((await repository.list())[0]).toMatchObject({ syncState: "failed", captureState: "failed" });
  });

  it("retries transcription with the persisted server recording id", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();
    const apiRecord = {
      id: "server-recording",
      patient_id: "P-10482",
      label: null,
      duration_seconds: 42,
      doctor_name: "Dr. Aparna",
      status: "recorded",
      recorded_at: "2026-04-23T06:12:00.000Z"
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ record: apiRecord }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ error: { code: "WORKER_DOWN" } }, { status: 502 }))
      .mockResolvedValueOnce(
        Response.json({
          recording_id: apiRecord.id,
          transcript: "Retry transcript.",
          audio_storage_path: "clinic/doctor/recording.webm",
          status: "transcribed"
        })
      ) as unknown as typeof fetch;

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher}
        localRepository={repository}
        recorderFactory={async () => recorder}
        onNavigate={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10482" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Recording saved on this device.");
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await screen.findByText("Unable to transcribe recording.");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await expect(screen.findByText("Transcript ready.")).resolves.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/api/recordings", expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://worker.example.com/api/transcribe", expect.any(Object));
    expect(fetcher).toHaveBeenNthCalledWith(3, "https://worker.example.com/api/transcribe", expect.any(Object));
    expect((await repository.list())[0]).toMatchObject({
      serverRecordingId: "server-recording",
      syncState: "transcribed",
      transcript: "Retry transcript."
    });
  });
});
