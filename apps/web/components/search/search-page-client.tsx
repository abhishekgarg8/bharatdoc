"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchScreen } from "@/components/search/search-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import {
  demoDashboardRecords,
  fetchDashboardRecords,
  type DashboardRecord
} from "@/lib/client/dashboard-data";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { destinationForInactiveDoctor, fetchCurrentDoctor } from "@/lib/client/session";

interface SearchPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

export function SearchPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken = false,
  onNavigate
}: SearchPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<DashboardRecord[]>(demoOnMissingToken ? demoDashboardRecords : []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSearchContext() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token) {
        if (demoOnMissingToken) {
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

        const nextRecords = await fetchDashboardRecords(token, fetcher);

        if (isMounted) {
          setRecords(nextRecords);
        }
      } catch {
        if (isMounted) {
          if (demoOnMissingToken) {
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
  }, [client, demoOnMissingToken, fetcher, navigate]);

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
