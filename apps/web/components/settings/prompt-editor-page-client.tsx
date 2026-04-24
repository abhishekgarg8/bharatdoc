"use client";

import { useEffect, useMemo, useState } from "react";
import { PromptEditorScreen } from "@/components/settings/prompt-editor-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { fetchDoctorPreferences, type DoctorPreferences } from "@/lib/client/settings-api";

interface PromptEditorPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
}

export function PromptEditorPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken = false
}: PromptEditorPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<DoctorPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPreferences() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token) {
        if (demoOnMissingToken) {
          setLoading(false);
        } else {
          window.location.assign("/onboarding");
        }
        return;
      }

      setIdToken(token);

      try {
        const nextPreferences = await fetchDoctorPreferences(token, fetcher);

        if (isMounted) {
          setPreferences(nextPreferences);
        }
      } catch {
        if (isMounted && !demoOnMissingToken) {
          setError("Unable to load summary prompt. Please sign in again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, [client, demoOnMissingToken, fetcher]);

  if (loading) {
    return <PageLoading label="Loading summary prompt" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  const screenProps = {
    fetcher,
    ...(idToken ? { idToken } : {}),
    ...(preferences ? { initialPrompt: preferences.custom_prompt } : {})
  };

  return <PromptEditorScreen {...screenProps} />;
}
