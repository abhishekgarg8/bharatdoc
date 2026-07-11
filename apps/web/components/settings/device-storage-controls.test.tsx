import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceStorageControls } from "@/components/settings/device-storage-controls";
import { createMemoryLocalRecordingRepository, type LocalRecording } from "@/lib/client/local-recordings";

const scope = { authUserId: "auth-1", doctorId: "doctor-1", clinicId: "clinic-1" };
const recording: LocalRecording = {
  id: "local-1", ...scope, patientId: "P-100", label: null, durationSeconds: 10,
  recordedAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z",
  audioBlob: new Blob(["audio"]), audioChunks: [], audioMimeType: "audio/webm",
  captureState: "stopped", syncState: "local", serverRecordingId: null, transcript: null, error: null
};

describe("DeviceStorageControls", () => {
  it("shows scoped usage and lets the doctor purge device-resident PHI", async () => {
    const repository = createMemoryLocalRecordingRepository([recording]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeviceStorageControls scope={scope} repository={repository} />);

    expect(await screen.findByText("1 recording · 5 B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove recordings from this device/i }));

    await waitFor(() => expect(screen.getByText("No local recordings on this device.")).toBeInTheDocument());
    await expect(repository.list()).resolves.toEqual([]);
  });

  it("fails closed without an unhandled rejection when device storage is unavailable", async () => {
    const repository = createMemoryLocalRecordingRepository();
    vi.spyOn(repository, "getUsage").mockRejectedValue(new Error("IndexedDB unavailable"));
    render(<DeviceStorageControls scope={scope} repository={repository} />);
    expect(await screen.findByText("Device storage is unavailable.")).toBeInTheDocument();
  });

  it("fails closed when device storage becomes unavailable during purge", async () => {
    const repository = createMemoryLocalRecordingRepository([recording]);
    vi.spyOn(repository, "purge").mockRejectedValue(new Error("IndexedDB unavailable"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeviceStorageControls scope={scope} repository={repository} />);
    fireEvent.click(await screen.findByRole("button", { name: /remove recordings from this device/i }));
    expect(await screen.findByText("Device storage is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove recordings from this device/i })).toBeDisabled();
  });
});
