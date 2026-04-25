import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptEditorPageClient } from "@/components/settings/prompt-editor-page-client";
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

describe("PromptEditorPageClient", () => {
  it("loads the saved prompt for authenticated users", async () => {
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

      return Response.json({
          preferences: {
            custom_prompt: "Summarize {{transcript}} into SOAP.",
            transcription_lang: "auto"
          }
        });
    }) as unknown as typeof fetch;

    render(<PromptEditorPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByRole("textbox", { name: "Prompt" })).resolves.toHaveValue("Summarize {{transcript}} into SOAP.");
  });

  it("shows an error instead of demo prompt when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<PromptEditorPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load summary prompt. Please sign in again.")).resolves.toBeInTheDocument();
  });

  it("redirects pending users away from prompt editing", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/me") {
        return Response.json({ doctor: { ...activeDoctor, account_status: "pending_approval" } });
      }

      return Response.json({ preferences: { custom_prompt: null, transcription_lang: "auto" } });
    }) as unknown as typeof fetch;

    render(<PromptEditorPageClient authClient={authClient} fetcher={fetcher} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
    expect(fetcher).not.toHaveBeenCalledWith("/api/settings/preferences", expect.anything());
  });
});
