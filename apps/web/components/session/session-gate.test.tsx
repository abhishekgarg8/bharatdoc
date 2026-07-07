import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionGate } from "@/components/session/session-gate";
import type { AuthClient } from "@/lib/client/auth-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SessionGate", () => {
  it("routes users without Supabase sessions to onboarding", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => null)
    };
    const navigate = vi.fn();

    render(<SessionGate authClient={authClient} onNavigate={navigate} />);

    expect(screen.getByText("Checking your session")).toBeInTheDocument();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/signup"));
  });

  it("routes active users to dashboard after /api/me", async () => {
    const authClient: AuthClient = {
      signUpWithPassword: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getCurrentIdToken: vi.fn(async () => "id-token")
    };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ doctor: { account_status: "active" } })));
    const navigate = vi.fn();

    render(<SessionGate authClient={authClient} onNavigate={navigate} />);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
  });
});
