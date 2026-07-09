"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, PasswordCredentialsSchema, type PasswordCredentials } from "@bharatdoc/shared";
import { ZodError } from "zod";

export interface AuthClient {
  signUpWithPassword(credentials: PasswordCredentials): Promise<string>;
  signInWithPassword(credentials: PasswordCredentials): Promise<string>;
  recoverSessionFromUrl?: (callbackUrl: string) => Promise<string>;
  resetPasswordForEmail?: (email: string) => Promise<void>;
  getCurrentIdToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

let browserClient: SupabaseClient | null = null;

const defaultSiteUrl = "https://bharatdoc-web.vercel.app/";
const sessionLookupTimeoutMs = 5000;
type VerifyTokenHashParams = Extract<Parameters<SupabaseClient["auth"]["verifyOtp"]>[0], { token_hash: string }>;
type SupportedEmailOtpType = VerifyTokenHashParams["type"];

export function getAuthRedirectUrl(): string {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    defaultSiteUrl;
  let url = configuredUrl.trim();

  if (!url) {
    url = defaultSiteUrl;
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}/`;
}

export function getAuthCallbackUrl(): string {
  return new URL("/auth/callback", getAuthRedirectUrl()).toString();
}

function getSupabaseBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase client environment is not configured.");
  }

  browserClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  });

  return browserClient;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const fieldNames = new Set(error.issues.flatMap((issue) => issue.path.map(String)));

    if (fieldNames.has("email")) {
      return "Please enter a valid email.";
    }

    if (fieldNames.has("password")) {
      return "Use at least 8 characters.";
    }

    return "Check your login details and try again.";
  }

  if (error instanceof Error) {
    if (/fetch|network|load failed/i.test(error.message)) {
      return "Unable to reach authentication service. Check your connection and try again.";
    }

    return error.message;
  }

  return "Authentication failed. Please try again.";
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return String(error ?? "");
}

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }

  const candidate = error as { code?: unknown; status?: unknown; name?: unknown };
  return [candidate.code, candidate.status, candidate.name].map((value) => String(value ?? "")).join(" ");
}

export function signupErrorMessage(error: unknown): string {
  const text = errorText(error);
  const metadata = `${text} ${errorCode(error)}`;

  if (/already|registered|exists|duplicate|user_already_exists|email_exists/i.test(metadata)) {
    return "Email is already registered. Log in instead.";
  }

  if (/rate|too many|429|over_email_send_rate_limit|email rate limit/i.test(metadata)) {
    return "Too many signup attempts. Wait a few minutes, then try again. Reference: AUTH_SIGNUP_RATE_LIMIT.";
  }

  if (/smtp|mail|email.*deliver|send.*email|provider|relay/i.test(metadata)) {
    return "BharatDoc could not send the confirmation email. Try again later or contact support. Reference: AUTH_SIGNUP_EMAIL_DELIVERY.";
  }

  if (/disabled|signup.*off|signups.*not allowed|not.*enabled/i.test(metadata)) {
    return "Account creation is temporarily disabled. Contact BharatDoc support. Reference: AUTH_SIGNUP_DISABLED.";
  }

  if (/captcha|security check/i.test(metadata)) {
    return "Complete the security check and try again. Reference: AUTH_SIGNUP_CAPTCHA.";
  }

  if (/weak.*password|password/i.test(metadata)) {
    return "Use a stronger password with at least 8 characters.";
  }

  if (/invalid.*email|email/i.test(metadata)) {
    return "Please enter a valid email.";
  }

  return "Unable to create account. Try again later or contact support. Reference: AUTH_SIGNUP_UNKNOWN.";
}

async function getSessionWithTimeout(supabase: SupabaseClient) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => resolve(null), sessionLookupTimeoutMs);
  });

  try {
    return await Promise.race([supabase.auth.getSession(), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function getAccessTokenFromSession(supabase: SupabaseClient): Promise<string | null> {
  const result = await getSessionWithTimeout(supabase);

  if (!result || result.error) {
    return null;
  }

  return result.data.session?.access_token ?? null;
}

function parseCallbackParams(callbackUrl: string) {
  const url = new URL(callbackUrl, getAuthRedirectUrl());
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  const param = (name: string) => url.searchParams.get(name) ?? hashParams.get(name);

  return {
    accessToken: param("access_token"),
    code: param("code"),
    error: param("error_description") ?? param("error"),
    refreshToken: param("refresh_token"),
    tokenHash: param("token_hash"),
    type: param("type")
  };
}

function callbackLinkError(): Error {
  return new Error(
    "This confirmation link is invalid, expired, or already used. Log in if your email is already confirmed, or request a new signup email."
  );
}

async function recoverExistingOrThrow(supabase: SupabaseClient): Promise<string> {
  const token = await getAccessTokenFromSession(supabase);

  if (token) {
    return token;
  }

  throw callbackLinkError();
}

function isSupportedOtpType(type: string | null): type is SupportedEmailOtpType {
  return (
    type === "email" ||
    type === "signup" ||
    type === "invite" ||
    type === "magiclink" ||
    type === "recovery" ||
    type === "email_change"
  );
}

export function createSupabaseAuthClient(): AuthClient {
  return {
    async signUpWithPassword(credentials: PasswordCredentials): Promise<string> {
      const parsed = PasswordCredentialsSchema.parse(credentials);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.email,
        password: parsed.password,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
          data: {
            email: parsed.email
          }
        }
      });

      if (error) {
        throw new Error(signupErrorMessage(error));
      }

      if (!data.session?.access_token) {
        const identities = data.user?.identities ?? [];

        if (identities.length === 0) {
          throw new Error("Email is already registered. Log in instead.");
        }

        throw new Error("Confirm your email before continuing.");
      }

      return data.session.access_token;
    },

    async signInWithPassword(credentials: PasswordCredentials): Promise<string> {
      const parsed = PasswordCredentialsSchema.parse(credentials);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: parsed.email,
        password: parsed.password
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.session?.access_token) {
        throw new Error("Supabase did not return an auth session.");
      }

      return data.session.access_token;
    },

    async recoverSessionFromUrl(callbackUrl: string): Promise<string> {
      const supabase = getSupabaseBrowserClient();
      const params = parseCallbackParams(callbackUrl);

      if (params.error) {
        return recoverExistingOrThrow(supabase);
      }

      if (params.code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
        return error ? recoverExistingOrThrow(supabase) : data.session?.access_token ?? recoverExistingOrThrow(supabase);
      }

      if (params.accessToken && params.refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken
        });
        return error ? recoverExistingOrThrow(supabase) : data.session?.access_token ?? params.accessToken;
      }

      if (params.tokenHash && isSupportedOtpType(params.type)) {
        const otpParams: VerifyTokenHashParams = {
          token_hash: params.tokenHash,
          type: params.type
        };
        const { data, error } = await supabase.auth.verifyOtp(otpParams);
        return error ? recoverExistingOrThrow(supabase) : data.session?.access_token ?? recoverExistingOrThrow(supabase);
      }

      return recoverExistingOrThrow(supabase);
    },

    async resetPasswordForEmail(email: string): Promise<void> {
      const parsedEmail = normalizeEmail(email);
      const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(parsedEmail, {
        redirectTo: getAuthRedirectUrl()
      });

      if (error) {
        throw new Error(error.message);
      }
    },

    async getCurrentIdToken(): Promise<string | null> {
      let supabase: SupabaseClient;

      try {
        supabase = getSupabaseBrowserClient();
      } catch {
        return null;
      }

      return getAccessTokenFromSession(supabase);
    },

    async signOut(): Promise<void> {
      await getSupabaseBrowserClient().auth.signOut();
    }
  };
}
