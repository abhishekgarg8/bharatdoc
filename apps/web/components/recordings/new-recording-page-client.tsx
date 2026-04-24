"use client";

import { useEffect, useMemo, useState } from "react";
import { RecordingScreen } from "@/components/recordings/recording-screen";
import { PageLoading } from "@/components/session/page-loading";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";

interface NewRecordingPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  useDemoRecorder?: boolean;
}

export function NewRecordingPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken = true,
  useDemoRecorder = false
}: NewRecordingPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    async function loadToken() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token && !demoOnMissingToken) {
        window.location.assign("/onboarding");
        return;
      }

      setIdToken(token ?? undefined);
      setLoading(false);
    }

    void loadToken();

    return () => {
      isMounted = false;
    };
  }, [client, demoOnMissingToken]);

  if (loading) {
    return <PageLoading label="Preparing recorder" />;
  }

  const recordingProps = {
    fetcher,
    useDemoRecorder,
    ...(idToken ? { idToken } : {})
  };

  return <RecordingScreen {...recordingProps} />;
}
