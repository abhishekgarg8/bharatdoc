import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPageClient } from "@/components/dashboard-page-client";
import type { AuthenticatedAppState } from "@/lib/client/authenticated-app";

const request = vi.fn();
let state: AuthenticatedAppState;
vi.mock("@/components/session/authenticated-app-shell", () => ({
  useAuthenticatedApp: () => ({ state, request, refresh: vi.fn(), signOut: vi.fn() })
}));

const context = {
  authUserId: "auth-user",
  doctorId: "11111111-1111-4111-8111-111111111111",
  clinicId: "22222222-2222-4222-8222-222222222222",
  clinicName: "Care Hospital",
  doctorName: "Dr. Nisha Shah",
  permissions: { canManageClinic: false, canRecord: true }
};

describe("DashboardPageClient shell integration", () => {
  beforeEach(() => {
    request.mockReset();
    state = { status: "active_online", token: "token", context, source: "network", refreshedAt: 1 };
  });

  it("consumes shell identity and keeps record loading page-specific", async () => {
    request.mockResolvedValue(Response.json({
      doctor: {}, clinic: null, pending_approvals_count: 0,
      records: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        patient_id: "P-20001",
        label: null,
        duration_seconds: 180,
        doctor_name: "Dr. Nisha Shah",
        status: "recorded",
        recorded_at: "2026-04-23T06:12:00.000Z"
      }]
    }));

    render(<DashboardPageClient />);

    await expect(screen.findByText("P-20001")).resolves.toBeInTheDocument();
    expect(screen.getAllByText("Dr. Nisha Shah")).toHaveLength(2);
    expect(screen.getByText("Care Hospital")).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith("/api/dashboard", { headers: { Authorization: "Bearer token" } });
    expect(request).not.toHaveBeenCalledWith("/api/me", expect.anything());
  });

  it("renders stale minimum context without requesting record PHI offline", async () => {
    state = { status: "active_offline_stale", token: "token", context, source: "cache", cachedAt: 1, expiresAt: 2 };

    render(<DashboardPageClient />);

    await expect(screen.findByText("Care Hospital")).resolves.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Consultations" })).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("shows demo records only when the shell explicitly provides demo state", async () => {
    state = { status: "active_demo", context, source: "demo" };

    render(<DashboardPageClient />);

    await expect(screen.findByText("P-10482")).resolves.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it("does not substitute demo data when authenticated record loading fails", async () => {
    request.mockResolvedValue(Response.json({ error: { message: "failed" } }, { status: 500 }));

    render(<DashboardPageClient />);

    await expect(screen.findByText("Unable to load dashboard. Please try again.")).resolves.toBeInTheDocument();
    expect(screen.queryByText("P-10482")).not.toBeInTheDocument();
  });
});
