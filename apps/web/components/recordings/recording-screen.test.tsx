import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordingScreen } from "@/components/recordings/recording-screen";
import type { AudioRecorder } from "@/lib/client/audio-recorder";
import { createMemoryLocalRecordingRepository } from "@/lib/client/local-recordings";

function createRecorder(overrides: Partial<AudioRecorder> = {}): AudioRecorder {
  return {
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => ({
      blob: new Blob(["audio"], { type: "audio/webm" }),
      mimeType: "audio/webm",
      durationSeconds: 42
    })),
    ...overrides
  };
}

describe("RecordingScreen", () => {
  it("records, saves locally, and produces a demo transcript", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const recorder = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: " p-10482 " } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));

    await expect(screen.findByText("Recording started.")).resolves.toBeInTheDocument();
    expect(recorder.start).toHaveBeenCalled();

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
      syncState: "transcribed"
    });
  });

  it("pauses and resumes the active recorder", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const recorder = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);

    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-10482" } });
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    await waitFor(() => expect(recorder.pause).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    await waitFor(() => expect(recorder.resume).toHaveBeenCalled());
  });

  it("requires patient id before saving stopped audio", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const recorder = createRecorder();

    render(<RecordingScreen localRepository={repository} recorderFactory={async () => recorder} />);

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await screen.findByText("Recording started.");
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));

    await expect(screen.findByText("Patient ID is required before transcription.")).resolves.toBeInTheDocument();
  });
});
