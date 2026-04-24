import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordingDetailPageClient } from "@/components/recordings/recording-detail-page-client";
import type { AuthClient } from "@/lib/client/auth-client";

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
  pdf_storage_path: null
};

describe("RecordingDetailPageClient", () => {
  it("loads authenticated recording detail", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ recording: apiRecording })) as unknown as typeof fetch;

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

  it("renders demo recording detail when no token is available", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    render(<RecordingDetailPageClient recordingId="p-10481" authClient={authClient} />);

    await expect(screen.findByRole("heading", { name: "P-10481" })).resolves.toBeInTheDocument();
    expect(screen.getByText(/I have had fever for two days/)).toBeInTheDocument();
  });
});
