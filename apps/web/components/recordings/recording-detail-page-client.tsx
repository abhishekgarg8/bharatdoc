"use client";

import { useEffect, useMemo, useState } from "react";
import { TranscriptSummaryScreen } from "@/components/recordings/transcript-summary-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import {
  findDemoRecordingDetail,
  type RecordingDetailRecord
} from "@/lib/client/recording-detail-data";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor, fetchCurrentDoctor } from "@/lib/client/session";
import { fetchRecordingDetail } from "@/lib/client/summary-api";

interface RecordingDetailPageClientProps {
  recordingId: string;
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

export function RecordingDetailPageClient({
  recordingId,
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  onNavigate
}: RecordingDetailPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);
  const [recording, setRecording] = useState<RecordingDetailRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRecording() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token) {
        if (allowDemoFallback) {
          setRecording(findDemoRecordingDetail(recordingId));
          setLoading(false);
        } else {
          navigate("/onboarding");
        }
        return;
      }

      setIdToken(token);

      let didRedirect = false;

      try {
        const me = await fetchCurrentDoctor(token, fetcher);

        if (!isMounted) {
          return;
        }

        const inactiveDestination = destinationForInactiveDoctor(me.doctor);

        if (inactiveDestination) {
          didRedirect = true;
          navigate(inactiveDestination);
          return;
        }

        const detail = await fetchRecordingDetail(token, recordingId, fetcher);

        if (isMounted) {
          setRecording(detail);
        }
      } catch {
        if (isMounted) {
          setError("Unable to load recording.");
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadRecording();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate, recordingId]);

  if (loading) {
    return <PageLoading label="Loading recording" />;
  }

  if (error || !recording) {
    return <PageError message={error ?? "Recording was not found."} />;
  }

  const detailProps = {
    recording,
    fetcher,
    ...(idToken ? { idToken } : {})
  };

  return <TranscriptSummaryScreen {...detailProps} />;
}
