"use client";

import { useEffect, useMemo, useState } from "react";
import { TranscriptSummaryScreen } from "@/components/recordings/transcript-summary-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import {
  findDemoRecordingDetail,
  type RecordingDetailRecord
} from "@/lib/client/recording-detail-data";
import { createFirebasePhoneAuthClient, type PhoneAuthClient } from "@/lib/client/phone-auth";
import { fetchRecordingDetail } from "@/lib/client/summary-api";

interface RecordingDetailPageClientProps {
  recordingId: string;
  authClient?: PhoneAuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
}

export function RecordingDetailPageClient({
  recordingId,
  authClient,
  fetcher = fetch,
  demoOnMissingToken = true
}: RecordingDetailPageClientProps) {
  const client = useMemo(() => authClient ?? createFirebasePhoneAuthClient(), [authClient]);
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
        if (demoOnMissingToken) {
          setRecording(findDemoRecordingDetail(recordingId));
          setLoading(false);
        } else {
          window.location.assign("/onboarding");
        }
        return;
      }

      setIdToken(token);

      try {
        const detail = await fetchRecordingDetail(token, recordingId, fetcher);

        if (isMounted) {
          setRecording(detail);
        }
      } catch {
        if (isMounted) {
          setError("Unable to load recording.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadRecording();

    return () => {
      isMounted = false;
    };
  }, [client, demoOnMissingToken, fetcher, recordingId]);

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
