"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardScreen } from "@/components/dashboard-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import {
  demoDashboardRecords,
  fetchDashboardSnapshot,
  type DashboardRecord
} from "@/lib/client/dashboard-data";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor } from "@/lib/client/session";
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
  const [records, setRecords] = useState<DashboardRecord[]>(allowDemoFallback ? demoDashboardRecords : []);
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
          navigate("/onboarding");
        }
        return;
      }

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
          setDoctor(snapshot.doctor);
          setRecords(snapshot.records);
        }
      } catch {
        if (isMounted) {
          if (allowDemoFallback) {
            setRecords(demoDashboardRecords);
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

  const screenProps = {
    records,
    pendingApprovalsCount: doctor?.role === "owner" ? 1 : 0,
    ...(doctor?.name ? { doctorName: doctor.name } : {}),
    ...(doctor?.clinic_id ? { clinicName: "Your hospital" } : {})
  };

  return <DashboardScreen {...screenProps} />;
}
