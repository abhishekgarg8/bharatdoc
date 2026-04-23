import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardScreen } from "@/components/dashboard-screen";
import type { DashboardRecord } from "@/lib/client/dashboard-data";
import { buildLocalRecordingMetadata } from "@/lib/client/local-recordings";

describe("DashboardScreen", () => {
  it("renders clinic context and primary recording action", () => {
    render(<DashboardScreen />);

    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByText("Sunrise Clinic, Pune")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start recording/i })).toHaveAttribute("href", "/recording");
  });

  it("renders recent consultation records with status lifecycle", () => {
    render(<DashboardScreen />);

    expect(screen.getByText("P-10482")).toBeInTheDocument();
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

  it("loads saved local recordings into the dashboard with an offline marker", async () => {
    const localRecordingsRepository = {
      list: vi.fn(async () => [
        buildLocalRecordingMetadata({
          id: "local-p-20999",
          patientId: "P-20999",
          durationSeconds: 61,
          recordedAt: "2026-04-23T06:20:00.000Z"
        })
      ])
    };

    render(
      <DashboardScreen
        records={[]}
        localRecordingsRepository={localRecordingsRepository}
        pendingApprovalsCount={0}
        now={() => new Date("2026-04-23T09:00:00.000Z")}
      />
    );

    expect(await screen.findByText("P-20999")).toBeInTheDocument();
    expect(screen.getByLabelText("Stored offline")).toBeInTheDocument();
    expect(screen.getByText("1 recording saved locally · transcribe when connected")).toBeInTheDocument();
    await waitFor(() => expect(localRecordingsRepository.list).toHaveBeenCalledTimes(1));
    expect(screen.getByText("1 record · 1 pending transcription")).toBeInTheDocument();
  });
});
