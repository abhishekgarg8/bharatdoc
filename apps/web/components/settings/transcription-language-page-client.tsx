"use client";

import { useEffect, useMemo, useState } from "react";
import { TranscriptionLanguageScreen } from "@/components/settings/transcription-language-screen";
import { PageLoading } from "@/components/session/page-loading";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { fetchDoctorPreferences, type DoctorPreferences } from "@/lib/client/settings-api";

interface TranscriptionLanguagePageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
}

export function TranscriptionLanguagePageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken = true
}: TranscriptionLanguagePageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<DoctorPreferences | null>(null);

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
    return <PageLoading label="Loading language preferences" />;
  }

  const screenProps = {
    fetcher,
    ...(idToken ? { idToken } : {}),
    ...(preferences ? { initialLanguage: preferences.transcription_lang } : {})
  };

  return <TranscriptionLanguageScreen {...screenProps} />;
}
