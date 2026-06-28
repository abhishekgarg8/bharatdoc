"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, PasswordCredentialsSchema, type PasswordCredentials } from "@bharatdoc/shared";
import { ZodError } from "zod";

export interface AuthClient {
  signUpWithPassword(credentials: PasswordCredentials): Promise<string>;
  signInWithPassword(credentials: PasswordCredentials): Promise<string>;
  resetPasswordForEmail?: (email: string) => Promise<void>;
  getCurrentIdToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

let browserClient: SupabaseClient | null = null;

const defaultSiteUrl = "https://bharatdoc-web.vercel.app/";
const sessionLookupTimeoutMs = 5000;

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

  return url.endsWith("/") ? url : `${url}/`;
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

export function createSupabaseAuthClient(): AuthClient {
  return {
    async signUpWithPassword(credentials: PasswordCredentials): Promise<string> {
      const parsed = PasswordCredentialsSchema.parse(credentials);
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.email,
        password: parsed.password,
        options: {
          emailRedirectTo: getAuthRedirectUrl(),
          data: {
            email: parsed.email
          }
        }
      });

      if (error) {
        const isDuplicate = /already|registered|exists/i.test(error.message);
        throw new Error(isDuplicate ? "Email is already registered." : "Unable to create account. Please try again.");
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

      const result = await getSessionWithTimeout(supabase);

      if (!result) {
        return null;
      }

      const { data, error } = result;

      if (error) {
        return null;
      }

      return data.session?.access_token ?? null;
    },

    async signOut(): Promise<void> {
      await getSupabaseBrowserClient().auth.signOut();
    }
  };
}
