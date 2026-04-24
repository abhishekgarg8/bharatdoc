"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SettingsScreen,
  type SettingsActiveDoctor,
  type SettingsClinicProfile,
  type SettingsDoctorProfile
} from "@/components/settings/settings-screen";
import { PageError, PageLoading } from "@/components/session/page-loading";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import {
  fetchClinicAdminSnapshot,
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
  clinic: Awaited<ReturnType<typeof fetchClinicAdminSnapshot>>["clinic"]
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
  activeDoctors: Awaited<ReturnType<typeof fetchClinicAdminSnapshot>>["activeDoctors"]
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
  demoOnMissingToken = false,
  onNavigate
}: SettingsPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = useMemo(() => onNavigate ?? ((href: string) => window.location.assign(href)), [onNavigate]);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<SettingsDoctorProfile | null>(null);
  const [clinic, setClinic] = useState<SettingsClinicProfile | null>(null);
  const [activeDoctors, setActiveDoctors] = useState<SettingsActiveDoctor[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
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

        setDoctor(toSettingsDoctor(me.doctor));

        if (me.doctor.role === "owner") {
          const snapshot = await fetchClinicAdminSnapshot(token, fetcher);

          if (!isMounted) {
            return;
          }

          setClinic(toSettingsClinic(snapshot.clinic));
          setActiveDoctors(toSettingsActiveDoctors(snapshot.activeDoctors));
          setPendingApprovals(snapshot.pendingApprovals);
        }
      } catch {
        if (isMounted) {
          if (demoOnMissingToken) {
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
  }, [client, demoOnMissingToken, fetcher, navigate]);

  if (loading) {
    return <PageLoading label="Loading settings" />;
  }

  if (error) {
    return <PageError message={error} />;
  }

  if (demoOnMissingToken && !idToken && !doctor) {
    return <SettingsScreen fetcher={fetcher} allowLocalDemoWrites demoMode />;
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

  return <SettingsScreen {...screenProps} />;
}
