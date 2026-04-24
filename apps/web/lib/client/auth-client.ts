"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PasswordCredentialsSchema, type PasswordCredentials } from "@bharatdoc/shared";

export interface AuthClient {
  signUpWithPassword(credentials: PasswordCredentials): Promise<string>;
  signInWithPassword(credentials: PasswordCredentials): Promise<string>;
  getCurrentIdToken(): Promise<string | null>;
  signOut(): Promise<void>;
}

let browserClient: SupabaseClient | null = null;

const defaultSiteUrl = "https://bharatdoc-web.vercel.app/";

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
  if (error instanceof Error) {
    return error.message;
  }

  return "Authentication failed. Please try again.";
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

    async getCurrentIdToken(): Promise<string | null> {
      let supabase: SupabaseClient;

      try {
        supabase = getSupabaseBrowserClient();
      } catch {
        return null;
      }

      const { data, error } = await supabase.auth.getSession();

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
