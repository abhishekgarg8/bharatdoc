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
import { clearSearchNavigationState, readSearchNavigationState, scrubCurrentNavigationUrl } from "@/lib/client/search-navigation-state";
import { deleteRecording, fetchRecordingDetailBootstrap } from "@/lib/client/summary-api";
import {
  transcribeRecordingAudio,
  transcribeStoredRecordingAudio,
  type WorkerTranscriptionResponse
} from "@/lib/client/transcription-api";
import {
  createIndexedDbLocalRecordingRepository,
  localRecordingMatchesScope,
  localRecordingAudioBlob,
  type LocalRecordingScope,
  type LocalRecordingRepository
} from "@/lib/client/local-recordings";
import { appendDeviceLog } from "@/lib/client/device-logs";

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

function cameFromSearch(): boolean {
  if (typeof window === "undefined" || !document.referrer) return false;
  try {
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin && referrer.pathname === "/search";
  } catch {
    return false;
  }
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
  const [backNavigation, setBackNavigation] = useState<RecordingBackNavigation>({
    href: "/dashboard",
    label: "Back to dashboard",
    useHistoryBack: false
  });
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);
  const [localRecordingScope, setLocalRecordingScope] = useState<LocalRecordingScope | null>(null);
  const [recording, setRecording] = useState<RecordingDetailRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => scrubCurrentNavigationUrl(), []);

  useEffect(() => {
    let isMounted = true;

    async function loadRecording() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token) {
        clearSearchNavigationState();
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
          clearSearchNavigationState();
          didRedirect = true;
          navigate(inactiveDestination);
          return;
        }

        if (isMounted) {
          const scope = {
            authUserId: bootstrap.doctor.firebase_uid,
            doctorId: bootstrap.doctor.id,
            clinicId: bootstrap.doctor.clinic_id
          };
          setLocalRecordingScope(scope);
          if (readSearchNavigationState(scope)?.records.some(({ id }) => id === recordingId)) {
            setBackNavigation({
              href: "/search",
              label: "Back to search results",
              useHistoryBack: cameFromSearch() && window.history.length > 1
            });
          }
          setRecording(bootstrap.recording);
        }
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          clearSearchNavigationState();
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
      (item) =>
        localRecordingScope &&
        localRecordingMatchesScope(item, localRecordingScope) &&
        (item.serverRecordingId === recordingIdToTranscribe || item.id === recordingIdToTranscribe)
    );
    const audioBlob = localRecording ? localRecordingAudioBlob(localRecording) : null;
    const audioMimeType = localRecording?.audioMimeType ?? null;

    if (!localRecording || !audioBlob || !audioMimeType) {
      return transcribeStoredRecordingAudio(idToken, recordingIdToTranscribe, fetcher);
    }

    await repository.markTranscribing(localRecording.id);
    const result = await transcribeRecordingAudio(idToken, recordingIdToTranscribe, audioBlob, audioMimeType, fetcher);
    await repository.markTranscribed(localRecording.id, result.transcript).catch(() => {
      appendDeviceLog({ level: "warn", event: "recording.local_cleanup_retry_required" });
    });

    return result;
  }

  async function removeMatchingLocalRecording(recordingIdToDelete: string): Promise<void> {
    const localRecordings = await repository.list();
    const matchingRecordings = localRecordings.filter(
      (item) =>
        localRecordingScope &&
        localRecordingMatchesScope(item, localRecordingScope) &&
        (item.id === recordingIdToDelete || item.serverRecordingId === recordingIdToDelete)
    );

    await Promise.all(matchingRecordings.map((item) => repository.remove(item.id)));
  }

  async function deleteCurrentRecording(recordingIdToDelete: string): Promise<void> {
    if (idToken) {
      const result = await deleteRecording(idToken, recordingIdToDelete, fetcher);
      await removeMatchingLocalRecording(recordingIdToDelete);
      if (result.deletion.state !== "completed") {
        throw new Error(`Consultation data was removed; storage cleanup is ${result.deletion.state}. Receipt: ${result.deletion.id}`);
      }
    } else if (!allowDemoFallback) {
      throw new Error("Authentication is required.");
    }

    if (!idToken) await removeMatchingLocalRecording(recordingIdToDelete);
    clearSearchNavigationState();
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
