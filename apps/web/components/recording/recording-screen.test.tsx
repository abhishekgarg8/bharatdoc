import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordingScreen } from "@/components/recording/recording-screen";
import type { AudioRecorderController, AudioRecorderFactory } from "@/lib/client/audio-recorder";
import type { LocalRecordingsRepository } from "@/lib/client/local-recordings";

function createRepository(): LocalRecordingsRepository {
  return {
    save: vi.fn(async (recording) => ({ ...recording, id: "saved-local-recording" })),
    get: vi.fn(async () => null),
    list: vi.fn(async () => []),
    remove: vi.fn(async () => undefined)
  };
}

function createAudioRecorder() {
  const blob = new Blob(["audio"], { type: "audio/webm" });
  const controller: AudioRecorderController = {
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(async () => blob),
    destroy: vi.fn()
  };
  const factory: AudioRecorderFactory = vi.fn(async () => controller);

  return { blob, controller, factory };
}

describe("RecordingScreen", () => {
  it("renders the pre-recording fields and start control", () => {
    render(<RecordingScreen repository={createRepository()} />);

    expect(screen.getByRole("heading", { name: "New consultation" })).toBeInTheDocument();
    expect(screen.getByLabelText(/patient id/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
  });

  it("supports recording, pausing, resuming, and stopping", async () => {
    const { controller, factory } = createAudioRecorder();

    render(<RecordingScreen audioRecorderFactory={factory} repository={createRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording");
    await waitFor(() => expect(screen.getByText("00:01")).toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getByRole("button", { name: /pause recording/i }));
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(controller.pause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /resume recording/i }));
    expect(screen.getByText("Recording")).toBeInTheDocument();
    expect(controller.resume).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await screen.findByRole("heading", { name: "Recording complete" });
    expect(controller.stop).toHaveBeenCalled();
  });

  it("saves completed recording metadata locally for later transcription", async () => {
    const repository = createRepository();
    const { blob, factory } = createAudioRecorder();

    render(
      <RecordingScreen
        audioRecorderFactory={factory}
        repository={repository}
        now={() => "2026-04-23T10:00:00.000Z"}
      />
    );

    fireEvent.change(screen.getByLabelText(/patient id/i), { target: { value: " p-10483 " } });
    fireEvent.change(screen.getByLabelText(/consultation label/i), { target: { value: " Follow-up " } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording");
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await screen.findByRole("heading", { name: "Recording complete" });
    fireEvent.click(screen.getByRole("button", { name: /save, transcribe later/i }));

    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: "P-10483",
        label: "Follow-up",
        durationSeconds: 0,
        recordedAt: "2026-04-23T10:00:00.000Z",
        audioBlob: blob,
        audioMimeType: "audio/webm",
        chunkCount: 1
      })
    );
    expect(screen.getByText(/Recording saved locally as saved-local-recording/i)).toBeInTheDocument();
  });

  it("requires a patient id before transcription", async () => {
    const { factory } = createAudioRecorder();

    render(<RecordingScreen audioRecorderFactory={factory} repository={createRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording");
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await screen.findByRole("heading", { name: "Recording complete" });
    fireEvent.click(screen.getByRole("button", { name: /transcribe now/i }));

    expect(screen.getByText("Patient ID is required before transcription.")).toBeInTheDocument();
  });

  it("saves locally and shows an offline transcription message", async () => {
    const repository = createRepository();
    const { factory } = createAudioRecorder();

    render(
      <RecordingScreen
        audioRecorderFactory={factory}
        repository={repository}
        online={() => false}
      />
    );

    fireEvent.change(screen.getByLabelText(/patient id/i), { target: { value: "P-10483" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording");
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await screen.findByRole("heading", { name: "Recording complete" });
    fireEvent.click(screen.getByRole("button", { name: /transcribe now/i }));

    await waitFor(() => expect(repository.save).toHaveBeenCalled());
    expect(screen.getByText("You're offline. Recording saved locally. Transcribe when connected.")).toBeInTheDocument();
  });

  it("transcribes completed audio when online and signed in", async () => {
    const repository = createRepository();
    const transcribeRecording = vi.fn(async () => ({
      recording_id: "saved-local-recording",
      transcript: "Patient reports fever."
    }));
    const { factory } = createAudioRecorder();

    render(
      <RecordingScreen
        audioRecorderFactory={factory}
        getIdToken={async () => "id-token"}
        repository={repository}
        transcribeRecording={transcribeRecording}
      />
    );

    fireEvent.change(screen.getByLabelText(/patient id/i), { target: { value: "P-10483" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording");
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));
    await screen.findByRole("heading", { name: "Recording complete" });
    fireEvent.click(screen.getByRole("button", { name: /transcribe now/i }));

    await screen.findByText("Transcript ready");
    expect(transcribeRecording).toHaveBeenCalledWith({
      idToken: "id-token",
      recording: expect.objectContaining({ id: "saved-local-recording", patientId: "P-10483" })
    });
    expect(screen.getByText("Patient reports fever.")).toBeInTheDocument();
  });

  it("shows an error when microphone capture cannot start", async () => {
    const factory = vi.fn(async () => {
      throw new Error("permission denied");
    });

    render(<RecordingScreen audioRecorderFactory={factory} repository={createRepository()} />);

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));

    expect(await screen.findByText("Microphone access is required to start recording.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "New consultation" })).toBeInTheDocument();
  });
});
