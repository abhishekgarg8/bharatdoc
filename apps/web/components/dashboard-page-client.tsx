"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardScreen } from "@/components/dashboard-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import {
  demoDashboardRecords,
  fetchDashboardSnapshot,
  type DashboardRecord
} from "@/lib/client/dashboard-data";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor } from "@/lib/client/session";
import { DEMO_LOCAL_RECORDING_SCOPE, type LocalRecordingScope } from "@/lib/client/local-recordings";
import { deleteRecording } from "@/lib/client/summary-api";
import {
  cacheLocalRecordingContext,
  localRecordingContextMatchesToken,
  readCachedLocalRecordingContext
} from "@/lib/client/local-recording-context";
import type { Doctor } from "@bharatdoc/shared";

interface DashboardPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

export function DashboardPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  onNavigate
}: DashboardPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(allowDemoFallback ? "Sunrise Hospital, Pune" : null);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(allowDemoFallback ? 1 : 0);
  const [records, setRecords] = useState<DashboardRecord[]>(allowDemoFallback ? demoDashboardRecords : []);
  const [localRecordingScope, setLocalRecordingScope] = useState<LocalRecordingScope | undefined>(
    allowDemoFallback ? DEMO_LOCAL_RECORDING_SCOPE : undefined
  );
  const [idToken, setIdToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      const idToken = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!idToken) {
        if (allowDemoFallback) {
          setLoading(false);
        } else {
          navigate("/signup");
        }
        return;
      }

      setIdToken(idToken);
      let didRedirect = false;

      try {
        const snapshot = await fetchDashboardSnapshot(idToken, fetcher);

        if (!isMounted) {
          return;
        }

        const inactiveDestination = destinationForInactiveDoctor(snapshot.doctor);

        if (inactiveDestination) {
          didRedirect = true;
          navigate(inactiveDestination);
          return;
        }

        if (isMounted) {
          const context = {
            clinicName: snapshot.clinic?.name ?? "Hospital",
            scope: {
              authUserId: snapshot.doctor.firebase_uid,
              doctorId: snapshot.doctor.id,
              clinicId: snapshot.doctor.clinic_id
            }
          };
          if (!localRecordingContextMatchesToken(context, idToken)) {
            throw new Error("Dashboard scope did not match the authenticated account.");
          }
          cacheLocalRecordingContext(context, idToken);
          setDoctor(snapshot.doctor);
          setClinicName(snapshot.clinic?.name ?? null);
          setLocalRecordingScope(context.scope);
          setPendingApprovalsCount(snapshot.pendingApprovalsCount);
          setRecords(snapshot.records);
        }
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

        if (isMounted) {
          if (allowDemoFallback) {
            setClinicName("Sunrise Hospital, Pune");
            setPendingApprovalsCount(1);
            setRecords(demoDashboardRecords);
          } else if (loadError instanceof TypeError) {
            const cachedContext = readCachedLocalRecordingContext(idToken);

            if (cachedContext) {
              setClinicName(cachedContext.clinicName);
              setLocalRecordingScope(cachedContext.scope);
              setPendingApprovalsCount(0);
              setRecords([]);
            } else {
              setError("Unable to load dashboard. Please sign in again.");
            }
          } else {
            setError("Unable to load dashboard. Please sign in again.");
          }
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Loading dashboard" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  async function deleteDashboardRecording(record: DashboardRecord): Promise<void> {
    if (idToken) {
      await deleteRecording(idToken, record.id, fetcher);
    } else if (!allowDemoFallback) {
      throw new Error("Authentication is required.");
    }

    setRecords((currentRecords) => currentRecords.filter((currentRecord) => currentRecord.id !== record.id));
  }

  const screenProps = {
    records,
    demoMode: allowDemoFallback,
    pendingApprovalsCount,
    onDeleteRecording: deleteDashboardRecording,
    ...(localRecordingScope ? { localRecordingScope } : {}),
    ...(doctor?.name ? { doctorName: doctor.name } : allowDemoFallback ? { doctorName: "Dr. Aparna Iyer" } : {}),
    ...(clinicName ? { clinicName } : {})
  };

  return <DashboardScreen {...screenProps} />;
}
