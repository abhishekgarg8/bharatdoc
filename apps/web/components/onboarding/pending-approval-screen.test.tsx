import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingApprovalScreen } from "@/components/onboarding/pending-approval-screen";

describe("PendingApprovalScreen", () => {
  it("locks the app with live hospital approval details", () => {
    render(
      <PendingApprovalScreen
        hospitalName="Bharat QA Hospital"
        ownerName="Dr. QA Owner"
        requestedAt="2026-04-25T03:44:00.000Z"
      />
    );

    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByText(/Bharat QA Hospital/)).toBeInTheDocument();
    expect(screen.getByText("Dr. QA Owner")).toBeInTheDocument();
    expect(screen.queryByText(/Sunrise Hospital/)).not.toBeInTheDocument();
    expect(screen.queryByText("MED42X")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("calls the sign-out handler", async () => {
    const onSignOut = vi.fn(async () => undefined);

    render(<PendingApprovalScreen hospitalName="Bharat QA Hospital" onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });

  it("shows a clear error when sign-out is unavailable", () => {
    render(<PendingApprovalScreen hospitalName="Bharat QA Hospital" />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Sign out is unavailable. Close the app and try again.");
  });

  it("shows a retryable error when sign-out fails", async () => {
    const onSignOut = vi.fn(async () => {
      throw new Error("session failure");
    });

    render(<PendingApprovalScreen hospitalName="Bharat QA Hospital" onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to sign out. Please try again.");
    });
    expect(screen.getByRole("button", { name: /sign out/i })).not.toBeDisabled();
  });
});
