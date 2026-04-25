import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPageClient } from "@/components/dashboard-page-client";
import type { AuthClient } from "@/lib/client/auth-client";
import type { Doctor } from "@bharatdoc/shared";

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-doctor",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Nisha Shah",
  specialization: "General Physician",
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

const apiRecord = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient_id: "P-20001",
  label: null,
  duration_seconds: 180,
  doctor_name: "Dr. Nisha Shah",
  status: "recorded",
  recorded_at: "2026-04-23T06:12:00.000Z"
};

describe("DashboardPageClient", () => {
  it("loads authenticated doctor context and dashboard records", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/dashboard") {
        return Response.json({
          doctor: activeDoctor,
          clinic: {
            id: activeDoctor.clinic_id,
            name: "Care Hospital",
            code: "CARE42",
            address: "Surat"
          },
          pending_approvals_count: 0,
          records: [apiRecord]
        });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(<DashboardPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findAllByText("Dr. Nisha Shah")).resolves.toHaveLength(2);
    expect(screen.getByText("Care Hospital")).toBeInTheDocument();
    expect(screen.getByText("P-20001")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard", {
      headers: { Authorization: "Bearer id-token" }
    });
    expect(fetcher).not.toHaveBeenCalledWith("/api/me", expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith("/api/recordings", expect.anything());
  });

  it("uses the dashboard API pending approval count for owners", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        doctor: { ...activeDoctor, role: "owner" },
        clinic: {
          id: activeDoctor.clinic_id,
          name: "Care Hospital",
          code: "CARE42",
          address: "Surat"
        },
        pending_approvals_count: 0,
        records: []
      })
    ) as unknown as typeof fetch;

    render(<DashboardPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Care Hospital")).resolves.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open settings/i })).toHaveTextContent("");
  });

  it("uses demo dashboard only when explicit demo fallback is enabled", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    render(<DashboardPageClient authClient={authClient} demoOnMissingToken />);

    await expect(screen.findByText("Dr. Aparna Iyer")).resolves.toBeInTheDocument();
    expect(screen.getByText("P-10482")).toBeInTheDocument();
  });

  it("shows an error instead of demo records when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<DashboardPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load dashboard. Please sign in again.")).resolves.toBeInTheDocument();
    expect(screen.queryByText("P-10482")).not.toBeInTheDocument();
  });

  it("redirects pending users away from the dashboard without loading records", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/dashboard") {
        return Response.json({
          doctor: { ...activeDoctor, account_status: "pending_approval" },
          clinic: null,
          pending_approvals_count: 0,
          records: []
        });
      }

      return Response.json({ records: [apiRecord] });
    }) as unknown as typeof fetch;

    render(<DashboardPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard", {
      headers: { Authorization: "Bearer id-token" }
    });
    expect(fetcher).not.toHaveBeenCalledWith("/api/recordings", expect.anything());
  });
});
