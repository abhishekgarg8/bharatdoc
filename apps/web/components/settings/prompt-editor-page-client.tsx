"use client";

import { useEffect, useMemo, useState } from "react";
import { PromptEditorScreen } from "@/components/settings/prompt-editor-screen";
import { PageLoading } from "@/components/session/page-loading";
import { createFirebasePhoneAuthClient, type PhoneAuthClient } from "@/lib/client/phone-auth";
import { fetchDoctorPreferences, type DoctorPreferences } from "@/lib/client/settings-api";

interface PromptEditorPageClientProps {
  authClient?: PhoneAuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
}

export function PromptEditorPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken = true
}: PromptEditorPageClientProps) {
  const client = useMemo(() => authClient ?? createFirebasePhoneAuthClient(), [authClient]);
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
    return <PageLoading label="Loading summary prompt" />;
  }

  const screenProps = {
    fetcher,
    ...(idToken ? { idToken } : {}),
    ...(preferences ? { initialPrompt: preferences.custom_prompt } : {})
  };

  return <PromptEditorScreen {...screenProps} />;
}
