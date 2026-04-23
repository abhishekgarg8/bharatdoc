import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "@/components/settings/settings-screen";
import type { PendingApproval } from "@/lib/client/clinic-admin-api";

const pendingApprovals: PendingApproval[] = [
  {
    id: "request-1",
    requested_at: "2026-04-23T07:10:00.000Z",
    doctor: {
      id: "doctor-1",
      name: "Dr. Meera Shah",
      specialization: "Pediatrician",
      phone: "+91 98340 12340",
      created_at: "2026-04-23T07:10:00.000Z"
    }
  }
];

describe("SettingsScreen", () => {
  it("renders profile, clinic admin, transcription, and account groups", () => {
    render(<SettingsScreen pendingApprovals={pendingApprovals} />);

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Aparna Iyer")).toBeInTheDocument();
    expect(screen.getByText("Clinic admin")).toBeInTheDocument();
    expect(screen.getByText("1 doctor waiting")).toBeInTheDocument();
    expect(screen.getByText("Language")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /language/i })).toHaveAttribute("href", "/settings/language");
    expect(screen.getByRole("link", { name: /summary prompt/i })).toHaveAttribute("href", "/settings/prompt");
    expect(screen.getByText("Delete account")).toBeInTheDocument();
  });

  it("approves a pending doctor through the API and removes the card", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));

    await waitFor(() => expect(screen.queryByText("Dr. Meera Shah")).not.toBeInTheDocument());
    expect(screen.getByText("No pending join requests.")).toBeInTheDocument();
    expect(screen.getByText("Dr. Meera Shah approved.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests/request-1/approve", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("rejects a pending doctor through the API and removes the card", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    render(<SettingsScreen pendingApprovals={pendingApprovals} idToken="id-token" fetcher={fetcher} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));

    await waitFor(() => expect(screen.queryByText("Dr. Meera Shah")).not.toBeInTheDocument());
    expect(screen.getByText("Dr. Meera Shah rejected.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests/request-1/reject", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: null })
    });
  });
});
