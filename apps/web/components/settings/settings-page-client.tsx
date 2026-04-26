"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SettingsScreen,
  type SettingsActiveDoctor,
  type SettingsClinicProfile,
  type SettingsDoctorProfile
} from "@/components/settings/settings-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { recoverExpiredSession } from "@/lib/client/api-error";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { useExplicitDemoMode } from "@/lib/client/demo-mode";
import {
  fetchSettingsBootstrap,
  type PendingApproval
} from "@/lib/client/clinic-admin-api";
import { destinationForInactiveDoctor, fetchCurrentDoctor } from "@/lib/client/session";

interface SettingsPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
  onNavigate?: (href: string) => void;
}

function toSettingsDoctor(doctor: Awaited<ReturnType<typeof fetchCurrentDoctor>>["doctor"]): SettingsDoctorProfile {
  return {
    name: doctor.name,
    specialization: doctor.specialization,
    phone: doctor.phone,
    role: doctor.role
  };
}

function toSettingsClinic(
  clinic: NonNullable<Awaited<ReturnType<typeof fetchSettingsBootstrap>>["clinic"]>
): SettingsClinicProfile {
  return {
    id: clinic.id,
    name: clinic.name,
    code: clinic.code,
    address: clinic.address,
    activeDoctorsCount: clinic.activeDoctorsCount
  };
}

function toSettingsActiveDoctors(
  activeDoctors: Awaited<ReturnType<typeof fetchSettingsBootstrap>>["activeDoctors"]
): SettingsActiveDoctor[] {
  return activeDoctors.map((doctor) => ({
    id: doctor.id,
    name: doctor.name,
    specialization: doctor.specialization,
    phone: doctor.phone,
    role: doctor.role,
    createdAt: doctor.created_at
  }));
}

export function SettingsPageClient({
  authClient,
  fetcher = fetch,
  demoOnMissingToken,
  onNavigate
}: SettingsPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const queryDemoMode = useExplicitDemoMode();
  const allowDemoFallback = demoOnMissingToken ?? queryDemoMode;
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<SettingsDoctorProfile | null>(null);
  const [clinic, setClinic] = useState<SettingsClinicProfile | null>(null);
  const [activeDoctors, setActiveDoctors] = useState<SettingsActiveDoctor[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function signOutAndNavigate(options: { ignoreMissingAuthClient?: boolean } = {}) {
    if (options.ignoreMissingAuthClient) {
      await client.signOut().catch(() => undefined);
      navigate("/onboarding");
      return;
    }

    await client.signOut();
    navigate("/onboarding");
  }

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      const token = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!token) {
        if (allowDemoFallback) {
          setLoading(false);
        } else {
          navigate("/onboarding");
        }
        return;
      }

      setIdToken(token);

      let didRedirect = false;

      try {
        const snapshot = await fetchSettingsBootstrap(token, fetcher);

        if (!isMounted) {
          return;
        }

        const inactiveDestination = destinationForInactiveDoctor(snapshot.doctor);

        if (inactiveDestination) {
          didRedirect = true;
          navigate(inactiveDestination);
          return;
        }

        setDoctor(toSettingsDoctor(snapshot.doctor));
        setClinic(snapshot.clinic ? toSettingsClinic(snapshot.clinic) : null);
        setActiveDoctors(toSettingsActiveDoctors(snapshot.activeDoctors));
        setPendingApprovals(snapshot.pendingApprovals);
      } catch (loadError) {
        if (await recoverExpiredSession(loadError, () => client.signOut(), navigate)) {
          didRedirect = true;
          return;
        }

        if (isMounted) {
          if (allowDemoFallback) {
            setDoctor(null);
            setClinic(null);
            setActiveDoctors([]);
            setPendingApprovals([]);
          } else {
            setError("Unable to load settings. Please sign in again.");
          }
        }
      } finally {
        if (isMounted && !didRedirect) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, [allowDemoFallback, client, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Loading settings" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  if (allowDemoFallback && !idToken && !doctor) {
    return (
      <SettingsScreen
        fetcher={fetcher}
        allowLocalDemoWrites
        demoMode
        onSignOut={() => signOutAndNavigate({ ignoreMissingAuthClient: true })}
      />
    );
  }

  const screenProps = {
    fetcher,
    allowLocalDemoWrites: false,
    activeDoctors,
    pendingApprovals,
    ...(idToken ? { idToken } : {}),
    ...(doctor ? { doctor } : {}),
    ...(clinic ? { clinic } : {})
  };

  return (
    <SettingsScreen
      {...screenProps}
      onSignOut={() => signOutAndNavigate()}
    />
  );
}
