import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordCredentialsSchema } from "@bharatdoc/shared";
import {
  authErrorMessage,
  createSupabaseAuthClient,
  getAuthCallbackUrl,
  getAuthRedirectUrl,
  signupErrorMessage
} from "@/lib/client/auth-client";
import { readSearchNavigationState, saveSearchNavigationState } from "@/lib/client/search-navigation-state";

const supabaseMocks = vi.hoisted(() => {
  const signUp = vi.fn();
  const signInWithPassword = vi.fn();
  const resetPasswordForEmail = vi.fn();
  const exchangeCodeForSession = vi.fn();
  const setSession = vi.fn();
  const verifyOtp = vi.fn();
  const getSession = vi.fn();
  const signOut = vi.fn();
  const createClient = vi.fn(() => ({
    auth: {
      exchangeCodeForSession,
      getSession,
      setSession,
      signUp,
      signInWithPassword,
      resetPasswordForEmail,
      verifyOtp,
      signOut
    }
  }));

  return {
    createClient,
    exchangeCodeForSession,
    getSession,
    setSession,
    signUp,
    signInWithPassword,
    resetPasswordForEmail,
    verifyOtp,
    signOut
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseMocks.createClient
}));

afterEach(() => {
  vi.useRealTimers();
  supabaseMocks.createClient.mockClear();
  supabaseMocks.exchangeCodeForSession.mockReset();
  supabaseMocks.getSession.mockReset();
  supabaseMocks.setSession.mockReset();
  supabaseMocks.signUp.mockReset();
  supabaseMocks.signInWithPassword.mockReset();
  supabaseMocks.resetPasswordForEmail.mockReset();
  supabaseMocks.verifyOtp.mockReset();
  supabaseMocks.signOut.mockReset();
  vi.unstubAllEnvs();
});

describe("Supabase auth client", () => {
  it("signs up through the browser Supabase client and returns an access token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.signUp.mockResolvedValue({
      data: { session: { access_token: "access-token" } },
      error: null
    });

    await expect(
      createSupabaseAuthClient().signUpWithPassword({
        email: "Doctor@Example.com",
        password: "bharatdoc123"
      })
    ).resolves.toBe("access-token");

    expect(supabaseMocks.createClient).toHaveBeenCalledWith(
      "https://supabase.test",
      "anon-key",
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true
        }
      }
    );
    expect(supabaseMocks.signUp).toHaveBeenCalledWith({
      email: "doctor@example.com",
      password: "bharatdoc123",
      options: {
        emailRedirectTo: "https://bharatdoc-web.vercel.app/auth/callback",
        data: {
          email: "doctor@example.com"
        }
      }
    });
  });

  it("clears scoped patient search state when signing out", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.signOut.mockResolvedValue({ error: null });
    const scope = { authUserId: "auth-a", doctorId: "doctor-a", clinicId: "clinic-a" };
    saveSearchNavigationState(scope, { query: "P-SECRET", records: [] });

    await createSupabaseAuthClient().signOut();

    expect(readSearchNavigationState(scope)).toBeNull();
    expect(supabaseMocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("does not continue signup when Supabase requires email confirmation", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.signUp.mockResolvedValue({
      data: { user: { identities: [{ id: "identity" }] }, session: null },
      error: null
    });

    await expect(
      createSupabaseAuthClient().signUpWithPassword({
        email: "doctor@example.com",
        password: "bharatdoc123"
      })
    ).rejects.toThrow("Confirm your email before continuing.");
  });

  it("maps duplicate signup errors to log-in guidance", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.signUp.mockResolvedValue({
      data: { session: null },
      error: { message: "User already registered", code: "user_already_exists" }
    });

    await expect(
      createSupabaseAuthClient().signUpWithPassword({
        email: "doctor@example.com",
        password: "bharatdoc123"
      })
    ).rejects.toThrow("Email is already registered. Log in instead.");
  });

  it("maps provider signup failures to actionable recovery messages", () => {
    expect(signupErrorMessage({ message: "over_email_send_rate_limit", status: 429 })).toBe(
      "Too many signup attempts. Wait a few minutes, then try again. Reference: AUTH_SIGNUP_RATE_LIMIT."
    );
    expect(signupErrorMessage(new Error("Error sending confirmation email through SMTP provider"))).toBe(
      "BharatDoc could not send the confirmation email. Try again later or contact support. Reference: AUTH_SIGNUP_EMAIL_DELIVERY."
    );
    expect(signupErrorMessage({ message: "Signups not allowed for this project" })).toBe(
      "Account creation is temporarily disabled. Contact BharatDoc support. Reference: AUTH_SIGNUP_DISABLED."
    );
    expect(signupErrorMessage({ message: "captcha verification failed" })).toBe(
      "Complete the security check and try again. Reference: AUTH_SIGNUP_CAPTCHA."
    );
    expect(signupErrorMessage({ message: "unexpected auth gateway failure" })).toBe(
      "Unable to create account. Try again later or contact support. Reference: AUTH_SIGNUP_UNKNOWN."
    );
  });

  it("uses configured production URLs for Supabase email redirects", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bharatdoc-web.vercel.app");

    expect(getAuthRedirectUrl()).toBe("https://bharatdoc-web.vercel.app/");
    expect(getAuthCallbackUrl()).toBe("https://bharatdoc-web.vercel.app/auth/callback");
  });

  it("normalizes Vercel deployment URLs for Supabase email redirects", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "bharatdoc-web.vercel.app");

    expect(getAuthRedirectUrl()).toBe("https://bharatdoc-web.vercel.app/");
    expect(getAuthCallbackUrl()).toBe("https://bharatdoc-web.vercel.app/auth/callback");
  });

  it("normalizes configured site URLs to the origin before appending the callback path", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bharatdoc-web.vercel.app/ignored/path?next=https://evil.test");

    expect(getAuthRedirectUrl()).toBe("https://bharatdoc-web.vercel.app/");
    expect(getAuthCallbackUrl()).toBe("https://bharatdoc-web.vercel.app/auth/callback");
  });

  it("sends password reset links through Supabase with the production redirect", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    await expect(createSupabaseAuthClient().resetPasswordForEmail?.("Doctor@Example.com")).resolves.toBeUndefined();

    expect(supabaseMocks.resetPasswordForEmail).toHaveBeenCalledWith("doctor@example.com", {
      redirectTo: "https://bharatdoc-web.vercel.app/"
    });
  });

  it("exchanges Supabase callback codes for a session token", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "confirmed-token" } },
      error: null
    });

    await expect(
      createSupabaseAuthClient().recoverSessionFromUrl?.("https://bharatdoc.test/auth/callback?code=auth-code")
    ).resolves.toBe("confirmed-token");

    expect(supabaseMocks.exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
  });

  it("recovers hash token callbacks without leaking them through app redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.setSession.mockResolvedValue({
      data: { session: { access_token: "hash-token" } },
      error: null
    });

    await expect(
      createSupabaseAuthClient().recoverSessionFromUrl?.(
        "https://bharatdoc.test/auth/callback#access_token=hash-token&refresh_token=refresh-token&type=signup"
      )
    ).resolves.toBe("hash-token");

    expect(supabaseMocks.setSession).toHaveBeenCalledWith({
      access_token: "hash-token",
      refresh_token: "refresh-token"
    });
  });

  it("uses TokenHash callbacks when the confirmation template is configured that way", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.verifyOtp.mockResolvedValue({
      data: { session: { access_token: "otp-token" } },
      error: null
    });

    await expect(
      createSupabaseAuthClient().recoverSessionFromUrl?.(
        "https://bharatdoc.test/auth/callback?token_hash=token-hash&type=email"
      )
    ).resolves.toBe("otp-token");

    expect(supabaseMocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "token-hash",
      type: "email"
    });
  });

  it("falls back to an existing session when a callback link was already consumed", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid flow state" }
    });
    supabaseMocks.getSession.mockResolvedValue({
      data: { session: { access_token: "existing-token" } },
      error: null
    });

    await expect(
      createSupabaseAuthClient().recoverSessionFromUrl?.("https://bharatdoc.test/auth/callback?code=used-code")
    ).resolves.toBe("existing-token");
  });

  it("shows a safe recovery error when no callback exchange or session is available", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "expired" }
    });
    supabaseMocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    });

    await expect(
      createSupabaseAuthClient().recoverSessionFromUrl?.("https://bharatdoc.test/auth/callback?code=expired-code")
    ).rejects.toThrow("This confirmation link is invalid, expired, or already used.");
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

  it("treats a hung Supabase session lookup as unauthenticated", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    supabaseMocks.getSession.mockImplementation(() => new Promise(() => undefined));

    const token = createSupabaseAuthClient().getCurrentIdToken();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(token).resolves.toBeNull();
  });

  it("treats missing Supabase browser config as an unauthenticated session", async () => {
    await expect(createSupabaseAuthClient().getCurrentIdToken()).resolves.toBeNull();
    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });

  it("falls back to readable auth errors", () => {
    expect(authErrorMessage(new Error("Invalid login credentials"))).toBe("Invalid login credentials");
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Unable to reach authentication service. Check your connection and try again."
    );
    expect(authErrorMessage("nope")).toBe("Authentication failed. Please try again.");
  });

  it("maps Zod credential validation failures to readable auth errors", () => {
    const invalidEmail = PasswordCredentialsSchema.safeParse({
      email: "",
      password: "bharatdoc123"
    });
    const shortPassword = PasswordCredentialsSchema.safeParse({
      email: "doctor@example.com",
      password: "short"
    });

    expect(invalidEmail.success).toBe(false);
    expect(shortPassword.success).toBe(false);
    expect(authErrorMessage(invalidEmail.success ? null : invalidEmail.error)).toBe("Please enter a valid email.");
    expect(authErrorMessage(shortPassword.success ? null : shortPassword.error)).toBe("Use at least 8 characters.");
  });
});
