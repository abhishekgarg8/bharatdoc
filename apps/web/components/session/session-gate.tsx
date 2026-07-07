"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { destinationForDoctorStatus, fetchCurrentDoctor } from "@/lib/client/session";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { LogoMark } from "@/components/onboarding/logo-mark";

interface SessionGateProps {
  authClient?: AuthClient;
  onNavigate?: (href: string) => void;
}

export function SessionGate({ authClient, onNavigate }: SessionGateProps) {
  const client = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = onNavigate ?? ((href: string) => window.location.assign(href));
  const [message, setMessage] = useState("Checking your session");

  useEffect(() => {
    let isMounted = true;

    async function routeUser() {
      const idToken = await client.getCurrentIdToken();

      if (!isMounted) {
        return;
      }

      if (!idToken) {
        navigate("/signup");
        return;
      }

      try {
        const me = await fetchCurrentDoctor(idToken);
        navigate(destinationForDoctorStatus(me.doctor.account_status));
      } catch {
        if (isMounted) {
          setMessage("We could not load your profile. Please sign in again.");
          navigate("/signup");
        }
      }
    }

    void routeUser();

    return () => {
      isMounted = false;
    };
  }, [client, navigate]);

  return (
    <OnboardingShell className="items-center justify-center px-8 text-center">
      <LogoMark />
      <Loader2 className="mt-8 h-7 w-7 animate-spin text-terracotta" />
      <p className="mt-4 font-body text-sm text-ink-muted">{message}</p>
    </OnboardingShell>
  );
}
