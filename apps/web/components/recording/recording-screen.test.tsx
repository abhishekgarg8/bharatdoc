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

  it("saves completed recording metadata locally", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /save locally/i }));

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

  it("creates a playback preview for the completed audio blob", async () => {
    const createObjectURL = vi.fn(() => "blob:recording-preview");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL
    });
    const { blob, factory } = createAudioRecorder();

    const { unmount } = render(
      <RecordingScreen
        audioRecorderFactory={factory}
        repository={createRepository()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording");
    fireEvent.click(screen.getByRole("button", { name: /stop recording/i }));

    const audio = await screen.findByLabelText("Recording playback");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(audio).toHaveAttribute("src", "blob:recording-preview");
    expect(screen.getByRole("button", { name: /play recording/i })).toBeEnabled();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:recording-preview");
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
