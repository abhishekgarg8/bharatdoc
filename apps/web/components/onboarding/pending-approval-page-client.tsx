"use client";

import { useEffect, useMemo, useState } from "react";
import { PendingApprovalScreen } from "@/components/onboarding/pending-approval-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import { fetchPendingApprovalStatus, type PendingApprovalStatus } from "@/lib/client/pending-approval-api";

interface PendingApprovalPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

const demoStatus: Extract<PendingApprovalStatus, { account_status: "pending_approval" }> = {
  account_status: "pending_approval",
  doctor: {
    id: "demo-doctor",
    firebase_uid: "demo-auth-user",
    clinic_id: "demo-clinic",
    role: "doctor",
    account_status: "pending_approval",
    name: "Dr. Aparna Iyer",
    specialization: "General Physician",
    phone: "+919876543210",
    profile_photo_path: null,
    custom_prompt: null,
    transcription_lang: "auto",
    created_at: "2026-04-23T09:00:00.000Z"
  },
  clinic: {
    id: "demo-clinic",
    name: "Sunrise Hospital",
    code: "MED42X",
    address: "24 Baner Road, Pune"
  },
  owner: {
    id: "demo-owner",
    name: "Dr. Kavita Rao"
  },
  join_request: {
    id: "demo-request",
    requested_at: "2026-04-23T03:44:00.000Z",
    status: "pending"
  }
};

export function PendingApprovalPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  onNavigate
}: PendingApprovalPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Extract<PendingApprovalStatus, { account_status: "pending_approval" }> | null>(
    null
  );
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      const token = await client.getCurrentIdToken();
      let didRedirect = false;

      if (!isMounted) {
        return;
      }

      if (!token) {
        if (allowDemoFallback) {
          setStatus(demoStatus);
          setLoading(false);
        } else {
          navigate("/onboarding");
        }
        return;
      }

      try {
        setHasAuthToken(true);
        const nextStatus = await fetchPendingApprovalStatus(token, fetcher);

        if (!isMounted) {
          return;
        }

        if (nextStatus.account_status !== "pending_approval") {
          didRedirect = true;
          navigate(nextStatus.redirectTo);
          return;
        }

        setStatus(nextStatus);
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

        if (isMounted) {
          setError("Unable to load approval status. Please sign in again.");
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Loading approval status" />;
  }

  if (error || !status) {
    return <PageError message={error ?? "Unable to load approval status. Please sign in again."} />;
  }

  return (
    <PendingApprovalScreen
      hospitalName={status.clinic.name}
      ownerName={status.owner?.name ?? null}
      requestedAt={status.join_request?.requested_at ?? null}
      onSignOut={async () => {
        if (hasAuthToken) {
          await client.signOut();
        } else {
          await client.signOut().catch(() => undefined);
        }
        navigate("/onboarding");
      }}
    />
  );
}
