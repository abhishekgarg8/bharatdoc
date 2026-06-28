import { afterEach, describe, expect, it, vi } from "vitest";
import { PasswordCredentialsSchema } from "@bharatdoc/shared";
import {
  authErrorMessage,
  createSupabaseAuthClient,
  getAuthRedirectUrl,
  signupErrorMessage
} from "@/lib/client/auth-client";

const supabaseMocks = vi.hoisted(() => {
  const signUp = vi.fn();
  const signInWithPassword = vi.fn();
  const resetPasswordForEmail = vi.fn();
  const getSession = vi.fn();
  const signOut = vi.fn();
  const createClient = vi.fn(() => ({
    auth: {
      getSession,
      signUp,
      signInWithPassword,
      resetPasswordForEmail,
      signOut
    }
  }));

  return {
    createClient,
    getSession,
    signUp,
    signInWithPassword,
    resetPasswordForEmail,
    signOut
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseMocks.createClient
}));

afterEach(() => {
  vi.useRealTimers();
  supabaseMocks.createClient.mockClear();
  supabaseMocks.getSession.mockReset();
  supabaseMocks.signUp.mockReset();
  supabaseMocks.signInWithPassword.mockReset();
  supabaseMocks.resetPasswordForEmail.mockReset();
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
        emailRedirectTo: "https://bharatdoc-web.vercel.app/",
        data: {
          email: "doctor@example.com"
        }
      }
    });
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

  it("uses configured production site URL for Supabase email redirects", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bharatdoc-web.vercel.app");

    expect(getAuthRedirectUrl()).toBe("https://bharatdoc-web.vercel.app/");
  });

  it("normalizes Vercel deployment URLs for Supabase email redirects", () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "bharatdoc-web.vercel.app");

    expect(getAuthRedirectUrl()).toBe("https://bharatdoc-web.vercel.app/");
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
