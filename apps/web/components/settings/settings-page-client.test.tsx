import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SettingsPageClient } from "@/components/settings/settings-page-client";
import type { AuthClient } from "@/lib/client/auth-client";

describe("SettingsPageClient", () => {
  it("loads authenticated owner settings and clinic admin details", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/me") {
        return Response.json({
          doctor: {
            id: "doctor-1",
            firebase_uid: "firebase-owner",
            clinic_id: "clinic-1",
            role: "owner",
            account_status: "active",
            name: "Dr. Aparna Iyer",
            specialization: "General Physician",
            medical_reg_no: null,
            phone: "+919876543210",
            profile_photo_path: null,
            custom_prompt: null,
            transcription_lang: "auto",
            created_at: "2026-04-23T09:00:00.000Z"
          }
        });
      }

      if (url === "/api/clinic/admin") {
        return Response.json({
          clinic: {
            id: "clinic-1",
            name: "Sunrise Clinic",
            code: "MED42X",
            address: "24 Baner Road, Pune",
            activeDoctorsCount: 2
          },
          activeDoctors: [
            {
              id: "doctor-1",
              name: "Dr. Aparna Iyer",
              specialization: "General Physician",
              phone: "+919876543210",
              role: "owner",
              created_at: "2026-04-23T09:00:00.000Z"
            },
            {
              id: "doctor-2",
              name: "Dr. Meera Shah",
              specialization: "Pediatrician",
              phone: "+919834012340",
              role: "doctor",
              created_at: "2026-04-23T10:00:00.000Z"
            }
          ],
          pendingApprovals: []
        });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    }) as unknown as typeof fetch;

    render(<SettingsPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Dr. Aparna Iyer")).resolves.toBeInTheDocument();
    expect(screen.getByText("Clinic admin")).toBeInTheDocument();
    expect(screen.getByText("MED42X")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /active doctors/i })[0]!);
    await expect(screen.findByText("Current clinic members with active BharatDoc access.")).resolves.toBeInTheDocument();
    expect(screen.getAllByText("Dr. Meera Shah")).toHaveLength(2);
  });

  it("uses demo settings only when explicit demo fallback is enabled", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };

    render(<SettingsPageClient authClient={authClient} demoOnMissingToken />);

    await expect(screen.findByText("Dr. Aparna Iyer")).resolves.toBeInTheDocument();
    expect(screen.getByText("MED42X")).toBeInTheDocument();
  });

  it("shows an error instead of demo settings when authenticated loading fails", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    const fetcher = vi.fn(async () => Response.json({ error: { message: "failed" } }, { status: 500 })) as unknown as typeof fetch;

    render(<SettingsPageClient authClient={authClient} fetcher={fetcher} />);

    await expect(screen.findByText("Unable to load settings. Please sign in again.")).resolves.toBeInTheDocument();
  });
});
