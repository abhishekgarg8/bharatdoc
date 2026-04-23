import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardScreen } from "@/components/dashboard-screen";
import type { DashboardRecord } from "@/lib/client/dashboard-data";

describe("DashboardScreen", () => {
  it("renders clinic context and primary recording action", () => {
    render(<DashboardScreen />);

    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByText("Sunrise Clinic, Pune")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
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
});
