import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import type { PhoneAuthClient } from "@/lib/client/phone-auth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingScreen", () => {
  it("starts with the phone OTP step", () => {
    render(<OnboardingScreen />);

    expect(screen.getByText("Welcome to BharatDoc")).toBeInTheDocument();
    expect(screen.getAllByText("Mobile number").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /send otp/i })).toBeInTheDocument();
  });

  it("runs the join-clinic flow and navigates to pending approval", async () => {
    const verifyOtp = vi.fn(async () => "verified-id-token");
    const authClient: PhoneAuthClient = {
      sendOtp: vi.fn(async () => ({ verifyOtp })),
      getCurrentIdToken: vi.fn(async () => null)
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

    render(<OnboardingScreen phoneAuthClient={authClient} onNavigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByLabelText("OTP");
    fireEvent.change(screen.getByLabelText("OTP"), { target: { value: "427111" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));

    await screen.findByText("Profile details");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("Your clinic");
    fireEvent.click(screen.getByRole("button", { name: /check clinic code/i }));
    await screen.findByText("Sunrise Clinic");
    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
    expect(authClient.sendOtp).toHaveBeenCalledWith("+919876543210");
    expect(verifyOtp).toHaveBeenCalledWith("427111");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer verified-id-token" })
      })
    );
  });

  it("supports deterministic demo onboarding without Firebase or API calls", async () => {
    const navigate = vi.fn();

    render(<OnboardingScreen demoMode onNavigate={navigate} />);

    fireEvent.click(screen.getByRole("button", { name: /send otp/i }));
    await screen.findByLabelText("OTP");
    fireEvent.change(screen.getByLabelText("OTP"), { target: { value: "427111" } });
    fireEvent.click(screen.getByRole("button", { name: /verify & continue/i }));
    await screen.findByText("Profile details");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText("Your clinic");
    fireEvent.click(screen.getByRole("button", { name: /check clinic code/i }));
    await screen.findByText("Clinic found");
    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
  });
});
