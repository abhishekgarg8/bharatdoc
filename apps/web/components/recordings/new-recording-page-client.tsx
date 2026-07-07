"use client";

import { useEffect, useMemo, useState } from "react";
import { RecordingScreen } from "@/components/recordings/recording-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { fetchDashboardSnapshot } from "@/lib/client/dashboard-data";
import { useExplicitDemoMode, useExplicitMockRecorder } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor } from "@/lib/client/session";
import type { LocalRecordingScope } from "@/lib/client/local-recordings";

interface NewRecordingPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  useDemoRecorder?: boolean;
  onNavigate?: (href: string) => void;
}

export function NewRecordingPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  useDemoRecorder,
  onNavigate
}: NewRecordingPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const queryMockRecorder = useExplicitMockRecorder();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const shouldUseDemoRecorder = useDemoRecorder ?? (allowDemoFallback && queryMockRecorder);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);
  const [clinicName, setClinicName] = useState(allowDemoFallback ? "Sunrise Hospital" : "Hospital");
  const [localRecordingScope, setLocalRecordingScope] = useState<LocalRecordingScope | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadToken() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token && !allowDemoFallback) {
        navigate("/signup");
        return;
      }

      let didRedirect = false;

      try {
        if (token) {
          const snapshot = await fetchDashboardSnapshot(token, fetcher);

          if (!isMounted) {
            return;
          }

          const inactiveDestination = destinationForInactiveDoctor(snapshot.doctor);

          if (inactiveDestination) {
            didRedirect = true;
            navigate(inactiveDestination);
            return;
          }

          setClinicName(snapshot.clinic?.name ?? "Hospital");
          setLocalRecordingScope({
            authUserId: snapshot.doctor.firebase_uid,
            doctorId: snapshot.doctor.id,
            clinicId: snapshot.doctor.clinic_id
          });
        }

        setIdToken(token ?? undefined);
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

        if (isMounted && !allowDemoFallback) {
          setError("Unable to prepare recorder. Please sign in again.");
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadToken();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Preparing recorder" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  const recordingProps = {
    fetcher,
    clinicName,
    useDemoRecorder: shouldUseDemoRecorder,
    ...(localRecordingScope ? { localRecordingScope } : {}),
    ...(idToken ? { idToken } : {})
  };

  return <RecordingScreen {...recordingProps} />;
}
