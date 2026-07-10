import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { RecordingScreen } from "@/components/recordings/recording-screen";
import type { AudioRecorder, RecordedAudioChunk } from "@/lib/client/audio-recorder";
import {
  createMemoryLocalRecordingRepository,
  localRecordingStorageError,
  type LocalRecording,
  type LocalRecordingScope
} from "@/lib/client/local-recordings";

const capacitor = vi.hoisted(() => ({
  appStateListener: null as ((state: { isActive: boolean }) => void) | null,
  removeListener: vi.fn(async () => undefined),
  addListener: vi.fn(async (_event: string, listener: (state: { isActive: boolean }) => void) => {
    capacitor.appStateListener = listener;
    return { remove: capacitor.removeListener };
  })
}));

vi.mock("@capacitor/app", () => ({ App: { addListener: capacitor.addListener } }));

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
    checkpoint: vi.fn(),
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

const DEVICE_LOGS_URL = "/api/device-logs";
const RECORDINGS_URL = "/api/recordings";
const WORKER_TRANSCRIBE_URL = "https://worker.example.com/api/transcribe";
const scope: LocalRecordingScope = { authUserId: "auth-user-1", doctorId: "doctor-1", clinicId: "clinic-1" };

function savedRecording(overrides: Partial<LocalRecording> = {}): LocalRecording {
  return {
    id: "exact-local-recording",
    ...scope,
    patientId: "P-10482",
    label: "Follow-up",
    durationSeconds: 42,
    recordedAt: "2026-04-23T06:12:00.000Z",
    updatedAt: "2026-04-23T06:12:00.000Z",
    audioBlob: new Blob(["audio"], { type: "audio/webm" }),
    audioChunks: [],
    audioMimeType: "audio/webm",
    captureState: "stopped",
    syncState: "local",
    serverRecordingId: null,
    transcript: null,
    error: null,
    ...overrides
  };
}

function fetchUrl(call: readonly unknown[]): string {
  return String(call[0]);
}

function ensureUsableLocalStorage() {
  if (typeof window.localStorage?.clear === "function") {
    return;
  }

  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        store.delete(key);
      }),
      clear: vi.fn(() => {
        store.clear();
      })
    }
  });
}

describe("RecordingScreen", () => {
  beforeEach(() => {
    ensureUsableLocalStorage();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    capacitor.appStateListener = null;
    capacitor.addListener.mockClear();
    capacitor.removeListener.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("shows clinic context and current online state", () => {
    render(<RecordingScreen clinicName="Sunrise Hospital" useDemoRecorder />);

    expect(screen.getByText("Sunrise Hospital · Online")).toBeInTheDocument();
    expect(screen.getByText("Audio stays on this device until transcription.")).toBeInTheDocument();
  });

  it("surfaces quota failures while creating the first durable draft", async () => {
    const repository = createMemoryLocalRecordingRepository();
    repository.save = vi.fn(async () => {
      throw localRecordingStorageError(new DOMException("Quota exceeded", "QuotaExceededError"));
    });
    const { recorder } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));

    await expect(screen.findByText(/device storage is full/i)).resolves.toBeInTheDocument();
    expect(recorder.start).not.toHaveBeenCalled();
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

    expect(screen.getByRole("button", { name: /transcribe/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await expect(screen.findByText("Reconnect to transcribe. Audio stays saved on this device.")).resolves.toBeInTheDocument();
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

  it("drains ordered checkpoint writes before reporting a successful stop", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const originalAppend = repository.appendChunk.bind(repository);
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    repository.appendChunk = vi.fn(async (input) => {
      await writeGate;
      return originalAppend(input);
    });
    const { recorder, emitChunk } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    const chunkWrite = emitChunk(20);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await waitFor(() => expect(recorder.stop).toHaveBeenCalledOnce());
    expect(screen.queryByText("Recording saved on this device.")).not.toBeInTheDocument();
    releaseWrite();
    await act(async () => { await chunkWrite; });
    await expect(screen.findByText("Recording saved on this device.")).resolves.toBeInTheDocument();
    expect((await repository.list())[0]?.audioChunkMetadata).toHaveLength(1);
  });

  it("poisons pending writes and never claims saved after a quota failure", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const finalize = vi.spyOn(repository, "finalize");
    let rejectWrite!: (reason: unknown) => void;
    repository.appendChunk = vi.fn(() => new Promise<LocalRecording>((_resolve, reject) => {
      rejectWrite = reject;
    }));
    const { recorder, emitChunk } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    void emitChunk(20);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await waitFor(() => expect(repository.appendChunk).toHaveBeenCalledOnce());
    rejectWrite(new DOMException("Quota exceeded", "QuotaExceededError"));

    await expect(screen.findByText(/device storage is full/i)).resolves.toBeInTheDocument();
    expect(screen.queryByText("Recording saved on this device.")).not.toBeInTheDocument();
    expect(finalize).not.toHaveBeenCalled();
    await waitFor(() => expect(recorder.stop).toHaveBeenCalledOnce());
    expect((await repository.list())[0]).toMatchObject({ captureState: "recording" });
  });

  it("stops the recorder only once when a write fails during an in-flight stop", async () => {
    const repository = createMemoryLocalRecordingRepository();
    let rejectWrite!: (reason: unknown) => void;
    repository.appendChunk = vi.fn(() => new Promise<LocalRecording>((_resolve, reject) => {
      rejectWrite = reject;
    }));
    let finishStop!: () => void;
    const stopGate = new Promise<void>((resolve) => { finishStop = resolve; });
    const { recorder, emitChunk } = createRecorder({
      stop: vi.fn(async () => {
        await stopGate;
        return { blob: new Blob(["audio"], { type: "audio/webm" }), mimeType: "audio/webm", durationSeconds: 20 };
      })
    });

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    void emitChunk(20);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await waitFor(() => expect(repository.appendChunk).toHaveBeenCalledOnce());
    await act(async () => { rejectWrite(new DOMException("Quota exceeded", "QuotaExceededError")); });

    await expect(screen.findByText(/device storage is full/i)).resolves.toBeInTheDocument();
    expect(recorder.stop).toHaveBeenCalledOnce();
    await act(async () => { finishStop(); });
  });

  it("surfaces an immediate first-checkpoint quota failure", async () => {
    const repository = createMemoryLocalRecordingRepository();
    repository.appendChunk = vi.fn(async () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const { recorder, emitChunk } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    await act(async () => { await emitChunk(20); });

    await expect(screen.findByText(/device storage is full/i)).resolves.toBeInTheDocument();
    expect(screen.queryByText("Recording saved on this device.")).not.toBeInTheDocument();
    await waitFor(() => expect(recorder.stop).toHaveBeenCalledOnce());
  });

  it("retains earlier checkpoints when a mid-recording write fails", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const originalAppend = repository.appendChunk.bind(repository);
    repository.appendChunk = vi.fn(async (input) => {
      if (input.sequence === 1) throw new Error("IndexedDB write rejected.");
      return originalAppend(input);
    });
    const { recorder, emitChunk } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    await act(async () => { await emitChunk(20); });
    await act(async () => { await emitChunk(40); });

    await expect(screen.findByText("IndexedDB write rejected.")).resolves.toBeInTheDocument();
    await act(async () => { await emitChunk(60); });
    expect((await repository.list())[0]?.audioChunkMetadata).toHaveLength(1);
    expect(repository.appendChunk).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Recording saved on this device.")).not.toBeInTheDocument();
    await waitFor(() => expect(recorder.stop).toHaveBeenCalledOnce());
  });

  it("requests best-effort browser and Capacitor checkpoints while recording", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();

    const { unmount } = render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    await waitFor(() => expect(capacitor.addListener).toHaveBeenCalledWith("appStateChange", expect.any(Function)));

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    capacitor.appStateListener?.({ isActive: false });

    expect(recorder.checkpoint).toHaveBeenCalledTimes(3);
    unmount();
    await waitFor(() => expect(capacitor.removeListener).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("pagehide"));
    expect(recorder.checkpoint).toHaveBeenCalledTimes(3);
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

  it("serializes pause metadata after an in-flight audio checkpoint", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const originalAppend = repository.appendChunk.bind(repository);
    let releaseWrite!: () => void;
    const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    repository.appendChunk = vi.fn(async (input) => {
      await gate;
      return originalAppend(input);
    });
    const { recorder, emitChunk } = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    void emitChunk(20);
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(repository.appendChunk).toHaveBeenCalledOnce());
    expect((await repository.list())[0]).toMatchObject({ captureState: "recording", audioChunks: [] });

    releaseWrite();
    await waitFor(async () => {
      await expect(repository.get((await repository.list())[0]!.id)).resolves.toMatchObject({
        captureState: "paused",
        audioChunks: [expect.any(Blob)]
      });
    });
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

  it("loads only the exact stopped recording in StrictMode and persists reopened metadata edits", async () => {
    const repository = createMemoryLocalRecordingRepository([
      savedRecording(),
      savedRecording({ id: "newer-local-recording", patientId: "P-NEWER", recordedAt: "2026-04-24T06:12:00.000Z" })
    ]);

    render(
      <StrictMode>
        <RecordingScreen
          localRecordingId="exact-local-recording"
          localRecordingScope={scope}
          localRepository={repository}
          useDemoRecorder
        />
      </StrictMode>
    );

    await expect(screen.findByText("Local recording ready to transcribe.")).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Patient ID")).toHaveValue("P-10482");
    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: " p-10555 " } });
    fireEvent.blur(screen.getByLabelText("Patient ID"));
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: " Reopened visit " } });
    fireEvent.blur(screen.getByLabelText("Label"));

    await waitFor(async () => {
      await expect(repository.get("exact-local-recording")).resolves.toMatchObject({
        patientId: "P-10555",
        label: "Reopened visit"
      });
    });
    await expect(repository.get("newer-local-recording")).resolves.toMatchObject({ patientId: "P-NEWER" });
  });

  it("fails closed when the exact recording is missing or belongs to another scope", async () => {
    const repository = createMemoryLocalRecordingRepository([savedRecording({ doctorId: "doctor-2" })]);
    const { rerender } = render(
      <RecordingScreen
        localRecordingId="missing-recording"
        localRecordingScope={scope}
        localRepository={repository}
        useDemoRecorder
      />
    );

    await expect(screen.findByText("This local recording is unavailable for the current account.")).resolves.toBeInTheDocument();
    expect(screen.queryByDisplayValue("P-10482")).not.toBeInTheDocument();

    rerender(
      <RecordingScreen
        localRecordingId="exact-local-recording"
        localRecordingScope={scope}
        localRepository={repository}
        useDemoRecorder
      />
    );
    await expect(screen.findByText("This local recording is unavailable for the current account.")).resolves.toBeInTheDocument();
    expect(screen.queryByDisplayValue("P-10482")).not.toBeInTheDocument();
  });

  it("turns interrupted capture and transcription states into safe stopped or retry states", async () => {
    const captureRepository = createMemoryLocalRecordingRepository([
      savedRecording({ captureState: "paused", audioBlob: null, audioChunks: [new Blob(["audio"], { type: "audio/webm" })] })
    ]);
    const { unmount } = render(
      <RecordingScreen
        localRecordingId="exact-local-recording"
        localRecordingScope={scope}
        localRepository={captureRepository}
        useDemoRecorder
      />
    );

    await expect(screen.findByText("Recovered an interrupted local recording.")).resolves.toBeInTheDocument();
    await expect(captureRepository.get("exact-local-recording")).resolves.toMatchObject({ captureState: "stopped" });
    unmount();

    const transcriptionRepository = createMemoryLocalRecordingRepository([
      savedRecording({ captureState: "transcribing", syncState: "transcribing", serverRecordingId: "server-recording" })
    ]);
    render(
      <RecordingScreen
        localRecordingId="exact-local-recording"
        localRecordingScope={scope}
        localRepository={transcriptionRepository}
        useDemoRecorder
      />
    );

    await expect(screen.findByText("Transcription was interrupted. Retry when ready.")).resolves.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    await expect(transcriptionRepository.get("exact-local-recording")).resolves.toMatchObject({
      captureState: "failed",
      syncState: "failed",
      serverRecordingId: "server-recording"
    });
  });

  it("opens an already transcribed exact recording on its server detail", async () => {
    const navigate = vi.fn();
    const repository = createMemoryLocalRecordingRepository([
      savedRecording({
        captureState: "transcribed",
        syncState: "transcribed",
        serverRecordingId: "server-recording",
        transcript: "Ready"
      })
    ]);

    render(
      <RecordingScreen
        localRecordingId="exact-local-recording"
        localRecordingScope={scope}
        localRepository={repository}
        onNavigate={navigate}
        useDemoRecorder
      />
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/recordings/server-recording"));
  });

  it("retries an exact failed recording without creating duplicate server metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_RAILWAY_WORKER_URL", "https://worker.example.com");
    const repository = createMemoryLocalRecordingRepository([
      savedRecording({ captureState: "failed", syncState: "failed", serverRecordingId: "server-recording", error: "Worker stopped." })
    ]);
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url === DEVICE_LOGS_URL) return Response.json({ accepted: 1 }, { status: 202 });
      if (url === WORKER_TRANSCRIBE_URL) {
        return Response.json({
          recording_id: "server-recording",
          transcript: "Recovered transcript.",
          audio_storage_path: "clinic/doctor/recording.webm",
          status: "transcribed"
        });
      }
      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST", url } }, { status: 500 });
    });

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher as unknown as typeof fetch}
        localRecordingId="exact-local-recording"
        localRecordingScope={scope}
        localRepository={repository}
        onNavigate={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await expect(screen.findByText("Transcript ready.")).resolves.toBeInTheDocument();
    expect(fetcher.mock.calls.filter((call) => fetchUrl(call) === RECORDINGS_URL)).toHaveLength(0);
    expect(fetcher.mock.calls.filter((call) => fetchUrl(call) === WORKER_TRANSCRIBE_URL)).toHaveLength(1);
    await expect(repository.list()).resolves.toHaveLength(1);
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

    expect(screen.getByRole("button", { name: /transcribe/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await expect(screen.findByText("Patient ID is required before transcription.")).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Patient ID")).toHaveFocus();
    expect(screen.getByLabelText("Patient ID")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10483" } });
    expect(screen.getByLabelText("Patient ID")).toHaveAttribute("aria-invalid", "false");

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
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);

      if (url === DEVICE_LOGS_URL) {
        return Response.json({ accepted: 1 }, { status: 202 });
      }

      if (url === RECORDINGS_URL) {
        return Response.json({ record: apiRecord }, { status: 201 });
      }

      if (url === WORKER_TRANSCRIBE_URL) {
        return Response.json({
          recording_id: apiRecord.id,
          transcript: "Authenticated transcript.",
          audio_storage_path: "clinic/doctor/recording.webm",
          status: "transcribed"
        });
      }

      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST", url } }, { status: 500 });
    });

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher as unknown as typeof fetch}
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
    const recordingCall = fetcher.mock.calls.find((call) => fetchUrl(call) === RECORDINGS_URL);
    expect(recordingCall).toEqual([
      RECORDINGS_URL,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer id-token" })
      })
    ]);
    expect(JSON.parse(String((recordingCall?.[1] as RequestInit | undefined)?.body))).toMatchObject({
      patient_id: "P-10483",
      label: "Follow-up"
    });

    const transcribeCall = fetcher.mock.calls.find((call) => fetchUrl(call) === WORKER_TRANSCRIBE_URL);
    expect(transcribeCall).toEqual([
      WORKER_TRANSCRIBE_URL,
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer id-token" },
        body: expect.any(FormData)
      })
    ]);
  });

  it("does not call authenticated recording APIs when Patient ID is missing", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const { recorder } = createRecorder();
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      if (String(input) === DEVICE_LOGS_URL) {
        return Response.json({ accepted: 1 }, { status: 202 });
      }

      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 });
    });

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher as unknown as typeof fetch}
        localRepository={repository}
        recorderFactory={async () => recorder}
        onNavigate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await screen.findByText("Recording saved on this device.");

    expect(screen.getByRole("button", { name: /transcribe/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await expect(screen.findByText("Patient ID is required before transcription.")).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Patient ID")).toHaveFocus();

    const protectedApiCalls = fetcher.mock.calls.filter((call) =>
      [RECORDINGS_URL, WORKER_TRANSCRIBE_URL].includes(fetchUrl(call))
    );
    expect(protectedApiCalls).toHaveLength(0);
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
    let transcribeAttempts = 0;
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);

      if (url === DEVICE_LOGS_URL) {
        return Response.json({ accepted: 1 }, { status: 202 });
      }

      if (url === RECORDINGS_URL) {
        return Response.json({ record: apiRecord }, { status: 201 });
      }

      if (url === WORKER_TRANSCRIBE_URL) {
        transcribeAttempts += 1;

        if (transcribeAttempts === 1) {
          return Response.json({ error: { code: "WORKER_DOWN" } }, { status: 502 });
        }

        return Response.json({
          recording_id: apiRecord.id,
          transcript: "Retry transcript.",
          audio_storage_path: "clinic/doctor/recording.webm",
          status: "transcribed"
        });
      }

      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST", url } }, { status: 500 });
    });

    render(
      <RecordingScreen
        idToken="id-token"
        fetcher={fetcher as unknown as typeof fetch}
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
    expect(fetcher.mock.calls.filter((call) => fetchUrl(call) === RECORDINGS_URL)).toHaveLength(1);
    expect(fetcher.mock.calls.filter((call) => fetchUrl(call) === WORKER_TRANSCRIBE_URL)).toHaveLength(2);
    expect((await repository.list())[0]).toMatchObject({
      serverRecordingId: "server-recording",
      syncState: "transcribed",
      transcript: "Retry transcript."
    });
  });
});
