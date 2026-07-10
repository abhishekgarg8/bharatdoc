import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPageClient } from "@/components/search/search-page-client";
import type { AuthClient } from "@/lib/client/auth-client";
import type { Doctor } from "@bharatdoc/shared";
import { clearSearchNavigationState, readSearchNavigationState, saveSearchNavigationState } from "@/lib/client/search-navigation-state";

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

describe("SearchPageClient", () => {
  beforeEach(() => {
    clearSearchNavigationState();
    window.history.replaceState({}, "", "/search");
  });
  it("loads authenticated recent records and searches with the same token", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/dashboard") {
        return Response.json({ doctor: activeDoctor, records: [apiRecord] });
      }

      if (url === "/api/patients/search") {
        return Response.json({ records: [apiRecord] });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(<SearchPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("P-20001")).resolves.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Patient ID"), { target: { value: "P-20001" } });
    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));

    await expect(screen.findByText("Results for P-20001")).resolves.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard", {
      headers: { Authorization: "Bearer id-token" }
    });
    expect(fetcher).not.toHaveBeenCalledWith("/api/me", expect.anything());
    expect(fetcher).not.toHaveBeenCalledWith("/api/recordings", expect.anything());
    expect(fetcher).toHaveBeenCalledWith("/api/patients/search", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: "Bearer id-token", "Content-Type": "application/json" },
      body: JSON.stringify({ patient_id: "P-20001" })
    });
  });

  it("scrubs legacy patient query and fragment values during bootstrap", async () => {
    window.history.replaceState({}, "", "/search?patient_id=P-SECRET#result");
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ doctor: activeDoctor, records: [apiRecord] })) as unknown as typeof fetch;
    render(<SearchPageClient authClient={authClient} fetcher={fetcher} />);
    await screen.findByText("P-20001");
    expect(window.location.href).toBe(`${window.location.origin}/search`);
  });

  it("uses demo search only when explicit demo fallback is enabled", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    const oldScope = { authUserId: "old-auth", doctorId: "old-doctor", clinicId: "old-clinic" };
    saveSearchNavigationState(oldScope, { query: "P-OLD", records: [] });
    render(<SearchPageClient authClient={authClient} demoOnMissingToken />);

    await expect(screen.findByText("P-10482")).resolves.toBeInTheDocument();
    expect(readSearchNavigationState(oldScope)).toBeNull();
  });

  it("drops another account's restored search during authenticated bootstrap", async () => {
    const oldScope = { authUserId: "old-auth", doctorId: "old-doctor", clinicId: "old-clinic" };
    saveSearchNavigationState(oldScope, { query: "P-OLD", records: [] });
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(), signInWithPassword: vi.fn(), signOut: vi.fn(), getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ doctor: activeDoctor, records: [apiRecord] })) as unknown as typeof fetch;

    render(<SearchPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("P-20001")).resolves.toBeInTheDocument();
    expect(screen.getByText("Recent hospital records")).toBeInTheDocument();
    expect(readSearchNavigationState(oldScope)).toBeNull();
  });

  it("shows an error instead of demo records when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<SearchPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load search records. Please sign in again.")).resolves.toBeInTheDocument();
    expect(screen.queryByText("P-10482")).not.toBeInTheDocument();
  });

  it("signs out and redirects to onboarding when search bootstrap auth is expired", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(async () => undefined),
      getCurrentIdToken: vi.fn(async () => "expired-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({ error: { code: "AUTH_REQUIRED", message: "Supabase token verification failed." } }, { status: 401 })
    ) as unknown as typeof fetch;

    render(<SearchPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(authClient.signOut).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledWith("/signup");
    expect(screen.queryByText("Unable to load search records. Please sign in again.")).not.toBeInTheDocument();
  });

  it("redirects pending users away from search without loading records", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const oldScope = { authUserId: "old-auth", doctorId: "old-doctor", clinicId: "old-clinic" };
    saveSearchNavigationState(oldScope, { query: "P-OLD", records: [] });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/dashboard") {
        return Response.json({ doctor: { ...activeDoctor, account_status: "pending_approval" }, records: [] });
      }

      return Response.json({ records: [apiRecord] });
    }) as unknown as typeof fetch;

    render(<SearchPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard", {
      headers: { Authorization: "Bearer id-token" }
    });
    expect(fetcher).not.toHaveBeenCalledWith("/api/recordings", expect.anything());
    expect(readSearchNavigationState(oldScope)).toBeNull();
  });
});
