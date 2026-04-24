import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import type { AuthClient } from "@/lib/client/auth-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingScreen", () => {
  it("starts with the email password step", () => {
    render(<OnboardingScreen />);

    expect(screen.getByText("Welcome to BharatDoc")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("runs the join-clinic flow and navigates to pending approval", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(async () => "verified-id-token"),
      signInWithPassword: vi.fn(async () => "verified-id-token"),
      getCurrentIdToken: vi.fn(async () => null),
      signOut: vi.fn()
    };
    const navigate = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url.startsWith("/api/clinics/lookup")) {
        return Response.json({
          clinic_id: "clinic-id",
          clinic_name: "Sunrise Clinic",
          clinic_address: "24 Baner Road, Pune"
        });
      }

      if (url === "/api/auth/register") {
        return Response.json({ status: "pending_approval", role: "doctor" });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetcher);

    render(<OnboardingScreen authClient={authClient} onNavigate={navigate} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "DrAparna@Example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bharatdoc123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText("Profile details");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("Your clinic");
    fireEvent.click(screen.getByRole("button", { name: /check clinic code/i }));
    await screen.findByText("Sunrise Clinic");
    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
    expect(authClient.signUpWithPassword).toHaveBeenCalledWith({
      email: "draparna@example.com",
      password: "bharatdoc123"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer verified-id-token" })
      })
    );
  });

  it("supports deterministic demo onboarding without external auth or API calls", async () => {
    const navigate = vi.fn();

    render(<OnboardingScreen demoMode onNavigate={navigate} />);

    expect(screen.getByLabelText("Email")).toHaveValue("aparna@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("bharatdoc123");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText("Profile details");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText("Your clinic");
    fireEvent.click(screen.getByRole("button", { name: /check clinic code/i }));
    await screen.findByText("Clinic found");
    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
  });
});
