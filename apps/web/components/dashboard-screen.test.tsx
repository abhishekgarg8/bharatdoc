import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardScreen } from "@/components/dashboard-screen";
import type { DashboardRecord } from "@/lib/client/dashboard-data";
import { createMemoryLocalRecordingRepository, type LocalRecording } from "@/lib/client/local-recordings";

describe("DashboardScreen", () => {
  it("renders clinic context and primary recording action", () => {
    render(<DashboardScreen />);

    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByText("Sunrise Hospital, Pune")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toHaveAttribute("href", "/recordings/new");
    expect(screen.getByRole("link", { name: /search by patient id/i })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /open settings/i })).toHaveAttribute("href", "/settings");
  });

  it("renders recent consultation records with status lifecycle", () => {
    render(<DashboardScreen />);

    expect(screen.getByText("P-10482")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open recording P-10482" })).toHaveAttribute(
      "href",
      "/recordings/local-p-10482"
    );
    expect(screen.getByText("Transcribed")).toBeInTheDocument();
    expect(screen.getByText("Summary ready")).toBeInTheDocument();
    expect(screen.getByText("PDF saved")).toBeInTheDocument();
  });

  it("renders supplied clinic context and dashboard records", () => {
    const records: DashboardRecord[] = [
      {
        id: "p-20001",
        patientId: "P-20001",
        time: "Today, 12:05",
        duration: "4:18",
        doctorName: "Dr. Nisha",
        status: "recorded",
        recordedAt: "2026-04-23T06:35:00.000Z"
      }
    ];

    render(
      <DashboardScreen
        doctorName="Dr. Nisha Shah"
        clinicName="Care Clinic, Surat"
        records={records}
        pendingApprovalsCount={0}
      />
    );

    expect(screen.getByText("Dr. Nisha Shah")).toBeInTheDocument();
    expect(screen.getByText("Care Clinic, Surat")).toBeInTheDocument();
    expect(screen.getByText("P-20001")).toBeInTheDocument();
    expect(screen.getByText("1 record · 1 pending transcription")).toBeInTheDocument();
  });

  it("merges local device recordings into the dashboard", async () => {
    const localRecording: LocalRecording = {
      id: "local-recording",
      patientId: "P-LOCAL",
      label: null,
      durationSeconds: 30,
      recordedAt: "2026-04-23T08:00:00.000Z",
      updatedAt: "2026-04-23T08:00:00.000Z",
      audioBlob: new Blob(["audio"], { type: "audio/webm" }),
      audioChunks: [new Blob(["audio"], { type: "audio/webm" })],
      audioMimeType: "audio/webm",
      captureState: "stopped",
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    };
    const localRepository = createMemoryLocalRecordingRepository([localRecording]);

    render(<DashboardScreen records={[]} localRepository={localRepository} pendingApprovalsCount={0} />);

    await expect(screen.findByText("P-LOCAL")).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Stored offline")).toBeInTheDocument();
  });
});
