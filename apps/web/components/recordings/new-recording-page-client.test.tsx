import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewRecordingPageClient } from "@/components/recordings/new-recording-page-client";
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

describe("NewRecordingPageClient", () => {
  it("redirects pending users away from the recorder", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async () =>
      Response.json({ doctor: { ...activeDoctor, account_status: "pending_approval" } })
    ) as unknown as typeof fetch;

    render(<NewRecordingPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
  });
});
