import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PendingApprovalScreen } from "@/components/onboarding/pending-approval-screen";

describe("PendingApprovalScreen", () => {
  it("locks the app while owner approval is pending", () => {
    render(<PendingApprovalScreen />);

    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByText(/Sunrise Clinic/)).toBeInTheDocument();
    expect(screen.getByText("MED42X")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});
