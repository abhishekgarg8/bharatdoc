import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";
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
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

const apiRecording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  patient_id: "P-20001",
  label: null,
  duration_seconds: 180,
  doctor_name: "Dr. Nisha Shah",
  status: "transcribed",
  recorded_at: "2026-04-23T06:12:00.000Z",
  transcript: "Patient reports fever.",
  summary: null,
  pdf_storage_path: null,
  pdf_signed_url: null
};

describe("RecordingDetailPageClient", () => {
  it("loads authenticated recording detail", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/me") {
        return Response.json({ doctor: activeDoctor });
      }

      return Response.json({ recording: apiRecording });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
      />
    );

    await expect(screen.findByRole("heading", { name: "P-20001" })).resolves.toBeInTheDocument();
    expect(screen.getByText("Patient reports fever.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
      headers: { Authorization: "Bearer id-token" }
    });
  });

  it("renders demo recording detail only when explicit demo fallback is enabled", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    render(<RecordingDetailPageClient recordingId="p-10481" authClient={authClient} demoOnMissingToken />);

    await expect(screen.findByRole("heading", { name: "P-10481" })).resolves.toBeInTheDocument();
    expect(screen.getByText(/I have had fever for two days/)).toBeInTheDocument();
  });

  it("shows an error instead of demo detail when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<RecordingDetailPageClient recordingId="p-10481" authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load recording.")).resolves.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "P-10481" })).not.toBeInTheDocument();
  });

  it("redirects rejected users away from recording details", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/me") {
        return Response.json({ doctor: { ...activeDoctor, account_status: "rejected" } });
      }

      return Response.json({ recording: apiRecording });
    }) as unknown as typeof fetch;

    render(
      <RecordingDetailPageClient
        recordingId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        authClient={authClient}
        fetcher={fetcher}
        onNavigate={navigate}
      />
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/access-rejected"));
    expect(fetcher).not.toHaveBeenCalledWith(
      "/api/recordings/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expect.anything()
    );
  });
});
