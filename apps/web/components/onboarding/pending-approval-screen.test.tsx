import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingApprovalScreen } from "@/components/onboarding/pending-approval-screen";

describe("PendingApprovalScreen", () => {
  it("locks the app with live clinic approval details", () => {
    render(
      <PendingApprovalScreen
        clinicName="Bharat QA Clinic"
        clinicCode="R2BJZZ"
        ownerName="Dr. QA Owner"
        requestedAt="2026-04-25T03:44:00.000Z"
      />
    );

    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByText(/Bharat QA Clinic/)).toBeInTheDocument();
    expect(screen.getByText("R2BJZZ")).toBeInTheDocument();
    expect(screen.getByText("Dr. QA Owner")).toBeInTheDocument();
    expect(screen.queryByText(/Sunrise Clinic/)).not.toBeInTheDocument();
    expect(screen.queryByText("MED42X")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls the sign-out handler", async () => {
    const onSignOut = vi.fn(async () => undefined);

    render(<PendingApprovalScreen clinicName="Bharat QA Clinic" clinicCode="R2BJZZ" onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });
});
