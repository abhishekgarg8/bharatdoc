import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingApprovalPageClient } from "@/components/onboarding/pending-approval-page-client";
import type { AuthClient } from "@/lib/client/auth-client";

function createAuthClient(token: string | null = "id-token"): AuthClient {
  return {
    signUpWithPassword: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(async () => undefined),
    getCurrentIdToken: vi.fn(async () => token)
  };
}

describe("PendingApprovalPageClient", () => {
  it("loads pending approval details from the authenticated API", async () => {
    const authClient = createAuthClient();
    const fetcher = vi.fn(async () =>
      Response.json({
        account_status: "pending_approval",
        doctor: {
          id: "doctor-1",
          firebase_uid: "auth-user",
          clinic_id: "clinic-1",
          role: "doctor",
          account_status: "pending_approval",
          name: "Dr. Pending",
          specialization: "General Physician",
          phone: "+919876543210",
          profile_photo_path: null,
          custom_prompt: null,
          transcription_lang: "auto",
          created_at: "2026-04-25T03:40:00.000Z"
        },
        clinic: {
          id: "clinic-1",
          name: "Bharat QA Hospital",
          code: "R2BJZZ",
          address: "Pune"
        },
        owner: {
          id: "owner-1",
          name: "Dr. QA Owner"
        },
        join_request: {
          id: "request-1",
          requested_at: "2026-04-25T03:44:00.000Z",
          status: "pending"
        }
      })
    ) as unknown as typeof fetch;

    render(<PendingApprovalPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText(/Bharat QA Hospital/)).resolves.toBeInTheDocument();
    expect(screen.getByText("Dr. QA Owner")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/onboarding/pending-status", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("redirects active doctors away from the pending approval page", async () => {
    const authClient = createAuthClient();
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({
        account_status: "active",
        doctor: {
          id: "doctor-1",
          firebase_uid: "auth-user",
          clinic_id: "clinic-1",
          role: "doctor",
          account_status: "active",
          name: "Dr. Active",
          specialization: "General Physician",
          phone: "+919876543210",
          profile_photo_path: null,
          custom_prompt: null,
          transcription_lang: "auto",
          created_at: "2026-04-25T03:40:00.000Z"
        },
        redirectTo: "/dashboard"
      })
    ) as unknown as typeof fetch;

    render(<PendingApprovalPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("signs out pending doctors and returns to onboarding", async () => {
    const authClient = createAuthClient();
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({
        account_status: "pending_approval",
        doctor: {
          id: "doctor-1",
          firebase_uid: "auth-user",
          clinic_id: "clinic-1",
          role: "doctor",
          account_status: "pending_approval",
          name: "Dr. Pending",
          specialization: "General Physician",
          phone: "+919876543210",
          profile_photo_path: null,
          custom_prompt: null,
          transcription_lang: "auto",
          created_at: "2026-04-25T03:40:00.000Z"
        },
        clinic: {
          id: "clinic-1",
          name: "Bharat QA Hospital",
          code: "R2BJZZ",
          address: "Pune"
        },
        owner: null,
        join_request: null
      })
    ) as unknown as typeof fetch;

    render(<PendingApprovalPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await screen.findByText(/Bharat QA Hospital/);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });

  it("redirects missing-token users unless demo fallback is enabled", async () => {
    const authClient = createAuthClient(null);
    const navigate = vi.fn();

    render(<PendingApprovalPageClient authClient={authClient} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
  });

  it("signs out and redirects to onboarding when pending-status auth is expired", async () => {
    const authClient = createAuthClient("expired-token");
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "AUTH_REQUIRED", message: "Supabase token verification failed." } }, { status: 401 })
    ) as unknown as typeof fetch;

    render(<PendingApprovalPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/onboarding");
    expect(screen.queryByText("Unable to load approval status. Please sign in again.")).not.toBeInTheDocument();
  });

  it("allows demo fallback sign-out without a Supabase browser client", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(async () => {
        throw new Error("Supabase client environment is not configured.");
      }),
      getCurrentIdToken: vi.fn(async () => null)
    };
    const navigate = vi.fn();

    render(<PendingApprovalPageClient authClient={authClient} demoOnMissingToken onNavigate={navigate} />);

    await screen.findByText(/Sunrise Hospital/);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
  });
});
