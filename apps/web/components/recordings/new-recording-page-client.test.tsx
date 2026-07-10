import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewRecordingPageClient } from "@/components/recordings/new-recording-page-client";
import type { AuthClient } from "@/lib/client/auth-client";
import type { Doctor } from "@bharatdoc/shared";
import { cacheLocalRecordingContext } from "@/lib/client/local-recording-context";

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

describe("NewRecordingPageClient", () => {
  function tokenFor(sub: string): string {
    return `header.${btoa(JSON.stringify({ sub })).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_")}.signature`;
  }

  it("redirects pending users away from the recorder", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => tokenFor(activeDoctor.firebase_uid))
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({
        doctor: { ...activeDoctor, account_status: "pending_approval" },
        clinic: null,
        pending_approvals_count: 0,
        records: []
      })
    ) as unknown as typeof fetch;

    render(<NewRecordingPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
  });

  it("passes the authenticated clinic context into the recorder", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => tokenFor(activeDoctor.firebase_uid))
    };
    const fetcher = vi.fn(async () =>
      Response.json({
        doctor: activeDoctor,
        clinic: {
          id: activeDoctor.clinic_id,
          name: "Sunrise Hospital",
          code: "MED42X",
          address: "Pune"
        },
        pending_approvals_count: 0,
        records: []
      })
    ) as unknown as typeof fetch;

    render(<NewRecordingPageClient authClient={authClient} fetcher={fetcher} useDemoRecorder />);

    await waitFor(() => {
      expect(document.body).toHaveTextContent("Sunrise Hospital · Online");
    });
  });

  it("uses the UID-matched cached scope when the dashboard is offline", async () => {
    const token = tokenFor(activeDoctor.firebase_uid);
    cacheLocalRecordingContext({
      clinicName: "Cached Hospital",
      scope: {
        authUserId: activeDoctor.firebase_uid,
        doctorId: activeDoctor.id,
        clinicId: activeDoctor.clinic_id
      }
    }, token);
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => token)
    };
    const fetcher = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    render(
      <NewRecordingPageClient
        authClient={authClient}
        fetcher={fetcher}
        localRecordingId="exact-local-recording"
        useDemoRecorder
      />
    );

    await waitFor(() => expect(document.body).toHaveTextContent("Cached Hospital"));
    expect(document.body).not.toHaveTextContent("Unable to prepare recorder");
  });
});
