import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingScreen } from "@/components/onboarding/onboarding-screen";
import type { AuthClient } from "@/lib/client/auth-client";

function createAuthClient(): AuthClient {
  return {
    signUpWithPassword: vi.fn(async () => "verified-id-token"),
    signInWithPassword: vi.fn(async () => "verified-id-token"),
    getCurrentIdToken: vi.fn(async () => null),
    signOut: vi.fn()
  };
}

const pgimerTarget = {
  clinicCode: "PGIMER",
  name: "Postgraduate Institute of Medical Education & Research, Chandigarh",
  address: "Sector-12, Chandigarh PIN-160012, India",
  headerImageSrc: "/images/pgimer-header.png",
  headerImageAlt: "Postgraduate Institute of Medical Education and Research Chandigarh",
  welcomeTitle: "Join PGIMER on BharatDoc",
  welcomeCopy: "Create your doctor login and request access to the PGIMER pilot workspace."
};

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

  it("hides progress only on the login credentials step", async () => {
    const authClient = createAuthClient();

    render(<OnboardingScreen authClient={authClient} />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(screen.queryByLabelText("Onboarding progress")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "doctor@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bharatdoc123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText("Profile details");
    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
  });

  it("toggles password visibility without changing the entered value", () => {
    render(<OnboardingScreen />);

    const passwordInput = screen.getByLabelText("Password");

    fireEvent.change(passwordInput, { target: { value: "bharatdoc123" } });
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /show password/i }));
    expect(passwordInput).toHaveAttribute("type", "text");
    expect(passwordInput).toHaveValue("bharatdoc123");

    fireEvent.click(screen.getByRole("button", { name: /hide password/i }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("sends forgot-password email only from the login mode", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(async () => "verified-id-token"),
      signInWithPassword: vi.fn(async () => "verified-id-token"),
      resetPasswordForEmail: vi.fn(async () => undefined),
      getCurrentIdToken: vi.fn(async () => null),
      signOut: vi.fn()
    };

    render(<OnboardingScreen authClient={authClient} />);

    expect(screen.queryByRole("button", { name: /forgot password/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /log in/i }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Doctor@Example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));

    await waitFor(() => expect(authClient.resetPasswordForEmail).toHaveBeenCalledWith("doctor@example.com"));
    expect(screen.getByText("Check your email for a reset link.")).toBeInTheDocument();
  });

  it("shows terms and privacy acknowledgment only for signup", () => {
    render(<OnboardingScreen />);

    expect(screen.getByText(/by creating an account/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms and privacy policy/i })).toHaveAttribute("href", "/terms-privacy");

    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(screen.queryByText(/by creating an account/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /terms and privacy policy/i })).not.toBeInTheDocument();
  });

  it("navigates back from profile and hospital while clearing active errors", async () => {
    const authClient = createAuthClient();

    render(<OnboardingScreen authClient={authClient} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "doctor@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bharatdoc123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText("Profile details");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your full name.");

    fireEvent.click(screen.getByRole("button", { name: /back to credentials/i }));

    expect(screen.getByText("Create login")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText("Profile details");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Dr. Aparna Iyer" } });
    fireEvent.change(screen.getByLabelText("Specialization"), { target: { value: "Pediatrics" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("Your hospital");
    fireEvent.change(screen.getByLabelText("Clinic Code"), { target: { value: "MED" } });
    fireEvent.click(screen.getByRole("button", { name: /find hospital/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the 6-character Clinic Code");

    fireEvent.click(screen.getByRole("button", { name: /back to profile/i }));

    expect(screen.getByText("Profile details")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("runs the join-hospital flow and navigates to pending approval", async () => {
    const authClient = createAuthClient();
    const navigate = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/clinics/lookup?code=MED42X") {
        return Response.json({
          clinic_id: "hospital-id",
          clinic_name: "Sunrise Hospital",
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
    expect(screen.queryByLabelText(/medical registration no/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Dr. Aparna Iyer" } });
    fireEvent.change(screen.getByLabelText("Specialization"), { target: { value: "Pediatrics" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("Your hospital");
    fireEvent.change(screen.getByLabelText("Clinic Code"), { target: { value: "med42x" } });
    fireEvent.click(screen.getByRole("button", { name: /find hospital/i }));
    await waitFor(() => expect(screen.getAllByText("Sunrise Hospital").length).toBeGreaterThan(0));
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
    const registerCall = fetcher.mock.calls.find(([input]) => input.toString() === "/api/auth/register");
    const registerBody = JSON.parse((registerCall?.[1] as RequestInit).body as string);
    expect(registerBody).toMatchObject({
      mode: "join_clinic",
      clinic_code: "MED42X"
    });
    expect(registerBody.profile).not.toHaveProperty("medical_reg_no");
    expect(registerBody.profile).toMatchObject({
      name: "Dr. Aparna Iyer",
      specialization: "Pediatrics"
    });
  });

  it("runs the PGIMER branded join flow with a locked clinic code", async () => {
    const authClient = createAuthClient();
    const navigate = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = input.toString();

      if (url === "/api/clinics/lookup?code=PGIMER") {
        return Response.json({
          clinic_id: "pgimer-id",
          clinic_name: pgimerTarget.name,
          clinic_address: pgimerTarget.address
        });
      }

      if (url === "/api/auth/register") {
        return Response.json({ status: "pending_approval", role: "doctor" });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetcher);

    render(<OnboardingScreen authClient={authClient} brandedJoinTarget={pgimerTarget} onNavigate={navigate} />);

    expect(screen.getByAltText(pgimerTarget.headerImageAlt)).toHaveAttribute("src", "/images/pgimer-header.png");
    expect(screen.getByText("Join PGIMER on BharatDoc")).toBeInTheDocument();
    expect(screen.getByText("Powered by BharatDoc")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "doctor@pgimer.edu.in" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bharatdoc123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText("Profile details");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Dr. PGIMER Pilot" } });
    fireEvent.change(screen.getByLabelText("Specialization"), { target: { value: "Internal Medicine" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("PGIMER pilot workspace");
    expect(screen.queryByRole("button", { name: "Create hospital" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /find hospital/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Clinic Code")).toHaveValue("PGIMER");

    fireEvent.change(screen.getByLabelText("Clinic Code"), { target: { value: "MED42X" } });
    expect(screen.getByLabelText("Clinic Code")).toHaveValue("PGIMER");

    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
    expect(fetcher).toHaveBeenCalledWith("/api/clinics/lookup?code=PGIMER");
    const registerCall = fetcher.mock.calls.find(([input]) => input.toString() === "/api/auth/register");
    const registerBody = JSON.parse((registerCall?.[1] as RequestInit).body as string);
    expect(registerBody).toMatchObject({
      mode: "join_clinic",
      clinic_code: "PGIMER",
      profile: {
        name: "Dr. PGIMER Pilot",
        specialization: "Internal Medicine"
      }
    });
  });

  it("shows a clear error when the PGIMER clinic code is not seeded", async () => {
    const authClient = createAuthClient();
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (input.toString() === "/api/clinics/lookup?code=PGIMER") {
        return Response.json({ error: { message: "Hospital code was not found." } }, { status: 404 });
      }

      return Response.json({ error: { message: "Unexpected request" } }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetcher);

    render(<OnboardingScreen authClient={authClient} brandedJoinTarget={pgimerTarget} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "doctor@pgimer.edu.in" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bharatdoc123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText("Profile details");
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Dr. PGIMER Pilot" } });
    fireEvent.change(screen.getByLabelText("Specialization"), { target: { value: "Internal Medicine" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("PGIMER pilot workspace");
    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hospital code was not found.");
    expect(fetcher).not.toHaveBeenCalledWith("/api/auth/register", expect.anything());
  });

  it("uses an Other specialization text field when the dropdown value is Other", async () => {
    const authClient = createAuthClient();

    render(<OnboardingScreen authClient={authClient} />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "doctor@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bharatdoc123" } });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await screen.findByText("Profile details");
    expect(screen.getByRole("combobox", { name: "Specialization" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "General Physician" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Dr. Kavita Rao" } });
    fireEvent.change(screen.getByLabelText("Specialization"), { target: { value: "Other" } });
    expect(screen.getByLabelText("Other specialization")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Other specialization"), { target: { value: "Sports Medicine" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    await screen.findByText("Your hospital");
  });

  it("supports deterministic demo onboarding without external auth or API calls", async () => {
    const navigate = vi.fn();

    render(<OnboardingScreen demoMode onNavigate={navigate} />);

    expect(screen.getByLabelText("Email")).toHaveValue("aparna@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("bharatdoc123");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await screen.findByText("Profile details");
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    await screen.findByText("Your hospital");
    await screen.findByText("Hospital selected");
    fireEvent.click(screen.getByRole("button", { name: /request to join/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval?demo=1"));
  });
});
