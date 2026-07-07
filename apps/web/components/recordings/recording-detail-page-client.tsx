"use client";

import { useEffect, useMemo, useState } from "react";
import { TranscriptSummaryScreen } from "@/components/recordings/transcript-summary-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import {
  findDemoRecordingDetail,
  type RecordingDetailRecord
} from "@/lib/client/recording-detail-data";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor } from "@/lib/client/session";
import { deleteRecording, fetchRecordingDetailBootstrap } from "@/lib/client/summary-api";
import {
  transcribeRecordingAudio,
  transcribeStoredRecordingAudio,
  type WorkerTranscriptionResponse
} from "@/lib/client/transcription-api";
import {
  createIndexedDbLocalRecordingRepository,
  localRecordingAudioBlob,
  type LocalRecordingRepository
} from "@/lib/client/local-recordings";

interface RecordingDetailPageClientProps {
  recordingId: string;
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  localRepository?: LocalRecordingRepository;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

interface RecordingBackNavigation {
  href: string;
  label: string;
  useHistoryBack: boolean;
}

function safeSameOriginPath(value: string | null): string | null {
  if (!value || typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);

    if (url.origin !== window.location.origin) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function currentRecordingBackNavigation(): RecordingBackNavigation {
  if (typeof window === "undefined") {
    return { href: "/dashboard", label: "Back to dashboard", useHistoryBack: false };
  }

  const params = new URLSearchParams(window.location.search);
  const explicitReturnTo = safeSameOriginPath(params.get("returnTo") ?? params.get("backHref"));

  if (explicitReturnTo) {
    return {
      href: explicitReturnTo,
      label: explicitReturnTo.startsWith("/search") ? "Back to search results" : "Go back",
      useHistoryBack: false
    };
  }

  const referrerPath = safeSameOriginPath(document.referrer);
  const cameFromSearch = referrerPath?.startsWith("/search") || params.get("from") === "search";

  if (cameFromSearch) {
    const patientQuery = params.get("patient_id") ?? params.get("patientId") ?? params.get("q");
    const href = patientQuery ? `/search?patient_id=${encodeURIComponent(patientQuery)}` : "/search";

    return {
      href,
      label: "Back to search results",
      useHistoryBack: Boolean(referrerPath?.startsWith("/search") && window.history.length > 1)
    };
  }

  return { href: "/dashboard", label: "Back to dashboard", useHistoryBack: false };
}

export function RecordingDetailPageClient({
  recordingId,
  authClient,
  fetcher = fetch,
  localRepository,
  demoOnMissingToken,
  onNavigate
}: RecordingDetailPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const repository = useMemo(
    () => localRepository ?? createIndexedDbLocalRecordingRepository(),
    [localRepository]
  );
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const backNavigation = useMemo(() => currentRecordingBackNavigation(), []);
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
          navigate("/signup");
        }
        return;
      }

      setIdToken(token);

      let didRedirect = false;

      try {
        const bootstrap = await fetchRecordingDetailBootstrap(token, recordingId, fetcher);

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
          setRecording(bootstrap.recording);
        }
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

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

  async function generateTranscriptFromLocalAudio(recordingIdToTranscribe: string): Promise<WorkerTranscriptionResponse> {
    if (!idToken) {
      throw new Error("Authentication is required.");
    }

    const localRecording = (await repository.list()).find(
      (item) => item.serverRecordingId === recordingIdToTranscribe || item.id === recordingIdToTranscribe
    );
    const audioBlob = localRecording ? localRecordingAudioBlob(localRecording) : null;
    const audioMimeType = localRecording?.audioMimeType ?? null;

    if (!localRecording || !audioBlob || !audioMimeType) {
      return transcribeStoredRecordingAudio(idToken, recordingIdToTranscribe, fetcher);
    }

    await repository.markTranscribing(localRecording.id);
    const result = await transcribeRecordingAudio(idToken, recordingIdToTranscribe, audioBlob, audioMimeType, fetcher);
    await repository.markTranscribed(localRecording.id, result.transcript);

    return result;
  }

  async function removeMatchingLocalRecording(recordingIdToDelete: string): Promise<void> {
    const localRecordings = await repository.list();
    const matchingRecordings = localRecordings.filter(
      (item) => item.id === recordingIdToDelete || item.serverRecordingId === recordingIdToDelete
    );

    await Promise.all(matchingRecordings.map((item) => repository.remove(item.id)));
  }

  async function deleteCurrentRecording(recordingIdToDelete: string): Promise<void> {
    if (idToken) {
      await deleteRecording(idToken, recordingIdToDelete, fetcher);
    } else if (!allowDemoFallback) {
      throw new Error("Authentication is required.");
    }

    await removeMatchingLocalRecording(recordingIdToDelete);
    navigate(backNavigation.href);
  }

  const detailProps = {
    recording,
    backHref: backNavigation.href,
    backLabel: backNavigation.label,
    fetcher,
    onGenerateTranscript: generateTranscriptFromLocalAudio,
    onDeleteRecording: deleteCurrentRecording,
    ...(backNavigation.useHistoryBack ? { onBack: () => window.history.back() } : {}),
    ...(idToken ? { idToken } : {})
  };

  return <TranscriptSummaryScreen {...detailProps} />;
}
