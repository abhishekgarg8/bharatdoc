"use client";

import { useEffect, useMemo, useState } from "react";
import { TranscriptionLanguageScreen } from "@/components/settings/transcription-language-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor } from "@/lib/client/session";
import { fetchDoctorPreferencesBootstrap, type DoctorPreferences } from "@/lib/client/settings-api";

interface TranscriptionLanguagePageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

export function TranscriptionLanguagePageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  onNavigate
}: TranscriptionLanguagePageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
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
        if (allowDemoFallback) {
          setLoading(false);
        } else {
          navigate("/onboarding");
        }
        return;
      }

      setIdToken(token);

      let didRedirect = false;

      try {
        const bootstrap = await fetchDoctorPreferencesBootstrap(token, fetcher);

        if (!isMounted) {
          return;
        }

        const inactiveDestination = destinationForInactiveDoctor(bootstrap.doctor);

        if (inactiveDestination) {
          didRedirect = true;
          navigate(inactiveDestination);
          return;
        }

        if (isMounted) {
          setPreferences(bootstrap.preferences);
        }
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

        if (isMounted && !allowDemoFallback) {
          setError("Unable to load language preferences. Please sign in again.");
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadPreferences();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Loading language preferences" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  const screenProps = {
    fetcher,
    ...(idToken ? { idToken } : {}),
    ...(preferences ? { initialLanguage: preferences.transcription_lang } : {})
  };

  return <TranscriptionLanguageScreen {...screenProps} />;
}
