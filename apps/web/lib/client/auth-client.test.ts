import { afterEach, describe, expect, it, vi } from "vitest";
import { authErrorMessage, createSupabaseAuthClient } from "@/lib/client/auth-client";

const supabaseMocks = vi.hoisted(() => {
  const signInWithPassword = vi.fn();
  const getSession = vi.fn();
  const signOut = vi.fn();
  const createClient = vi.fn(() => ({
    auth: {
      getSession,
      signInWithPassword,
      signOut
    }
  }));

  return {
    createClient,
    getSession,
    signInWithPassword,
    signOut
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseMocks.createClient
}));

afterEach(() => {
  supabaseMocks.createClient.mockClear();
  supabaseMocks.getSession.mockReset();
  supabaseMocks.signInWithPassword.mockReset();
  supabaseMocks.signOut.mockReset();
  vi.unstubAllEnvs();
});

describe("Supabase auth client", () => {
  it("signs up through the server endpoint and returns a Supabase access token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null
    });
    const fetcher = vi.fn(async () => Response.json({ email: "doctor@example.com" }));

    await expect(
      createSupabaseAuthClient(fetcher as unknown as typeof fetch).signUpWithPassword({
        email: "Doctor@Example.com",
        password: "bharatdoc123"
      })
    ).resolves.toBe("access-token");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/password/signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "doctor@example.com", password: "bharatdoc123" })
      })
    );
    expect(supabaseMocks.signInWithPassword).toHaveBeenCalledWith({
      email: "doctor@example.com",
      password: "bharatdoc123"
    });
  });

  it("returns the current access token from the persisted Supabase session", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
      error: null
    });

    await expect(createSupabaseAuthClient().getCurrentIdToken()).resolves.toBe("session-token");
  });

  it("treats missing Supabase browser config as an unauthenticated session", async () => {
    await expect(createSupabaseAuthClient().getCurrentIdToken()).resolves.toBeNull();
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });

  it("falls back to readable auth errors", () => {
    expect(authErrorMessage(new Error("Invalid login credentials"))).toBe("Invalid login credentials");
    expect(authErrorMessage("nope")).toBe("Authentication failed. Please try again.");
  });
});
