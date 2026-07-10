"use client";

import { useEffect, useState } from "react";
import { DashboardScreen } from "@/components/dashboard-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { useAuthenticatedApp } from "@/components/session/authenticated-app-shell";
import {
  demoDashboardRecords,
  fetchDashboardSnapshot,
  type DashboardRecord,
} from "@/lib/client/dashboard-data";
import { deleteRecording } from "@/lib/client/summary-api";

export function DashboardPageClient() {
  const app = useAuthenticatedApp();
  const { state } = app;
  const demoMode = state.status === "active_demo";
  const [loading, setLoading] = useState(state.status === "active_online");
  const [records, setRecords] = useState<DashboardRecord[]>(
    demoMode ? demoDashboardRecords : [],
  );
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(
    demoMode ? 1 : 0,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    if (state.status === "active_demo") {
      setError(null);
      setRecords(demoDashboardRecords);
      setPendingApprovalsCount(1);
      setLoading(false);
      return () => {
        current = false;
      };
    }
    if (state.status === "active_offline_stale") {
      setError(null);
      setRecords([]);
      setPendingApprovalsCount(0);
      setLoading(false);
      return () => {
        current = false;
      };
    }
    if (state.status !== "active_online")
      return () => {
        current = false;
      };

    setLoading(true);
    setError(null);
    void fetchDashboardSnapshot(state.token, app.request)
      .then((snapshot) => {
        if (!current) return;
        setRecords(snapshot.records);
        setPendingApprovalsCount(snapshot.pendingApprovalsCount);
      })
      .catch((loadError: unknown) => {
        if (
          current &&
          !(
            loadError instanceof Error &&
            ["AbortError", "AuthSessionExpiredError"].includes(loadError.name)
          )
        ) {
          setError("Unable to load dashboard. Please try again.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [app.request, state]);

  if (loading) return <PageLoading label="Loading dashboard" />;
  if (error) return <PageError message={error} />;
  if (!("context" in state)) return <PageLoading label="Loading dashboard" />;

  const context = state.context;
  const token = state.status === "active_demo" ? null : state.token;
  const localRecordingScope = {
    authUserId: context.authUserId,
    doctorId: context.doctorId,
    clinicId: context.clinicId,
  };

  async function deleteDashboardRecording(
    record: DashboardRecord,
  ): Promise<void> {
    if (token) await deleteRecording(token, record.id, app.request);
    setRecords((current) => current.filter((item) => item.id !== record.id));
  }

  return (
    <DashboardScreen
      records={records}
      demoMode={demoMode}
      pendingApprovalsCount={pendingApprovalsCount}
      onDeleteRecording={deleteDashboardRecording}
      localRecordingScope={localRecordingScope}
      doctorName={context.doctorName ?? "Doctor"}
      clinicName={context.clinicName}
    />
  );
}
