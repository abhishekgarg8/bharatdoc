"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardScreen } from "@/components/dashboard-screen";
import { PageLoading } from "@/components/session/page-loading";
import { createFirebasePhoneAuthClient, type PhoneAuthClient } from "@/lib/client/phone-auth";
import {
  demoDashboardRecords,
  fetchDashboardRecords,
  type DashboardRecord
} from "@/lib/client/dashboard-data";
import { fetchCurrentDoctor, type MeResponse } from "@/lib/client/session";

interface DashboardPageClientProps {
  authClient?: PhoneAuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
}

export function DashboardPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken = true
}: DashboardPageClientProps) {
  const client = useMemo(() => authClient ?? createFirebasePhoneAuthClient(), [authClient]);
  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<MeResponse["doctor"] | null>(null);
  const [records, setRecords] = useState<DashboardRecord[]>(demoDashboardRecords);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      const idToken = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!idToken) {
        if (demoOnMissingToken) {
          setLoading(false);
        } else {
          window.location.assign("/onboarding");
        }
        return;
      }

      try {
        const [me, nextRecords] = await Promise.all([
          fetchCurrentDoctor(idToken, fetcher),
          fetchDashboardRecords(idToken, fetcher)
        ]);

        if (isMounted) {
          setDoctor(me.doctor);
          setRecords(nextRecords);
        }
      } catch {
        if (isMounted) {
          setRecords(demoDashboardRecords);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [client, demoOnMissingToken, fetcher]);

  if (loading) {
    return <PageLoading label="Loading dashboard" />;
  }

  const screenProps = {
    records,
    pendingApprovalsCount: doctor?.role === "owner" ? 1 : 0,
    ...(doctor?.name ? { doctorName: doctor.name } : {}),
    ...(doctor?.clinic_id ? { clinicName: "Your clinic" } : {})
  };

  return <DashboardScreen {...screenProps} />;
}
