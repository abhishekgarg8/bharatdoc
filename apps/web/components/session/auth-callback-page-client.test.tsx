import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthCallbackPageClient } from "@/components/session/auth-callback-page-client";
import { ApiResponseError } from "@/lib/client/api-error";
import type { MeResponse } from "@/lib/client/session";

function meResponse(status: MeResponse["doctor"]["account_status"]): MeResponse {
  return { doctor: { account_status: status } } as MeResponse;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("AuthCallbackPageClient", () => {
  it("scrubs callback secrets and routes active users to the dashboard", async () => {
    window.history.pushState(null, "", "/auth/callback?code=secret-code#access_token=leaky");
    const authClient = {
      recoverSessionFromUrl: vi.fn(async () => "id-token")
    };
    const fetchDoctor = vi.fn(async () => meResponse("active"));
    const navigate = vi.fn();

    render(<AuthCallbackPageClient authClient={authClient} fetchDoctor={fetchDoctor} onNavigate={navigate} />);

    expect(screen.getByText("Confirming your email")).toBeInTheDocument();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
    expect(authClient.recoverSessionFromUrl).toHaveBeenCalledWith(
      expect.stringContaining("/auth/callback?code=secret-code#access_token=leaky")
    );
    expect(fetchDoctor).toHaveBeenCalledWith("id-token");
    expect(window.location.pathname).toBe("/auth/callback");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("routes pending users through the existing approval gate", async () => {
    window.history.pushState(null, "", "/auth/callback?code=pending-code");
    const navigate = vi.fn();

    render(
      <AuthCallbackPageClient
        authClient={{ recoverSessionFromUrl: vi.fn(async () => "id-token") }}
        fetchDoctor={vi.fn(async () => meResponse("pending_approval"))}
        onNavigate={navigate}
      />
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/pending-approval"));
  });

  it("continues onboarding for confirmed users who do not have a doctor profile yet", async () => {
    window.history.pushState(null, "", "/auth/callback?token_hash=token-hash&type=email");
    const navigate = vi.fn();

    render(
      <AuthCallbackPageClient
        authClient={{ recoverSessionFromUrl: vi.fn(async () => "id-token") }}
        fetchDoctor={vi.fn(async () => Promise.reject(new ApiResponseError("Missing profile.", 404, "PROFILE_NOT_FOUND")))}
        onNavigate={navigate}
      />
    );

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signup?confirmed=1"));
  });

  it("shows login and retry actions when session recovery fails", async () => {
    window.history.pushState(null, "", "/auth/callback?code=expired-code");
    const navigate = vi.fn();

    render(
      <AuthCallbackPageClient
        authClient={{ recoverSessionFromUrl: vi.fn(async () => Promise.reject(new Error("expired"))) }}
        onNavigate={navigate}
      />
    );

    expect(await screen.findByRole("heading", { name: "Link did not work" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log in or retry signup" }));
    expect(navigate).toHaveBeenCalledWith("/signup");
    expect(window.location.search).toBe("");
  });
});
