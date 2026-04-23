import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardScreen } from "@/components/dashboard-screen";

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
});
