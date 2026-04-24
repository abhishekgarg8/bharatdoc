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

function getSupabaseBrowserClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase client environment is not configured.");
  }

  browserClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true
    }
  });

  return browserClient;
}

async function readJsonOrThrow(response: Response): Promise<unknown> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Authentication failed. Please try again.");
  }

  return body;
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Authentication failed. Please try again.";
}

export function createSupabaseAuthClient(fetcher: typeof fetch = fetch): AuthClient {
  return {
    async signUpWithPassword(credentials: PasswordCredentials): Promise<string> {
      const parsed = PasswordCredentialsSchema.parse(credentials);
      await readJsonOrThrow(
        await fetcher("/api/auth/password/signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(parsed)
        })
      );

      return this.signInWithPassword(parsed);
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
