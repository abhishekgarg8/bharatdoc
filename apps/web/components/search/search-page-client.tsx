"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchScreen } from "@/components/search/search-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import {
  demoDashboardRecords,
  fetchDashboardSnapshot,
  type DashboardRecord
} from "@/lib/client/dashboard-data";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { destinationForInactiveDoctor } from "@/lib/client/session";

interface SearchPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

export function SearchPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  onNavigate
}: SearchPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<DashboardRecord[]>(allowDemoFallback ? demoDashboardRecords : []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSearchContext() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token) {
        if (allowDemoFallback) {
          setLoading(false);
        } else {
          navigate("/signup");
        }
        return;
      }

      setIdToken(token);

      let didRedirect = false;

      try {
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

        if (isMounted) {
          setRecords(snapshot.records);
        }
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

        if (isMounted) {
          if (allowDemoFallback) {
            setRecords(demoDashboardRecords);
          } else {
            setError("Unable to load search records. Please sign in again.");
          }
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadSearchContext();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Loading search" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  const searchProps = {
    fetcher,
    initialRecords: records,
    ...(idToken ? { idToken } : {})
  };

  return <SearchScreen {...searchProps} />;
}
