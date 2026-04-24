"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SettingsScreen,
  type SettingsActiveDoctor,
  type SettingsClinicProfile,
  type SettingsDoctorProfile
} from "@/components/settings/settings-screen";
import { PageLoading } from "@/components/session/page-loading";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import {
  fetchClinicAdminSnapshot,
  type PendingApproval
} from "@/lib/client/clinic-admin-api";
import { fetchCurrentDoctor } from "@/lib/client/session";

interface SettingsPageClientProps {
  authClient?: AuthClient;
  fetcher?: typeof fetch;
  demoOnMissingToken?: boolean;
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
  demoOnMissingToken = true
}: SettingsPageClientProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const [loading, setLoading] = useState(true);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<SettingsDoctorProfile | null>(null);
  const [clinic, setClinic] = useState<SettingsClinicProfile | null>(null);
  const [activeDoctors, setActiveDoctors] = useState<SettingsActiveDoctor[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

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
          window.location.assign("/onboarding");
        }
        return;
      }

      setIdToken(token);

      try {
        const me = await fetchCurrentDoctor(token, fetcher);

        if (!isMounted) {
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
          setDoctor(null);
          setClinic(null);
          setActiveDoctors([]);
          setPendingApprovals([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, [client, demoOnMissingToken, fetcher]);

  if (loading) {
    return <PageLoading label="Loading settings" />;
  }

  const screenProps = {
    fetcher,
    ...(idToken ? { idToken } : {}),
    ...(doctor ? { doctor } : {}),
    ...(clinic ? { clinic } : {}),
    ...(activeDoctors.length > 0 ? { activeDoctors } : {}),
    ...(pendingApprovals.length > 0 ? { pendingApprovals } : {})
  };

  return <SettingsScreen {...screenProps} />;
}
