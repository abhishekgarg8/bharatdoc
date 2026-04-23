"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { createFirebasePhoneAuthClient, type PhoneAuthClient } from "@/lib/client/phone-auth";
import { destinationForDoctorStatus, fetchCurrentDoctor } from "@/lib/client/session";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { LogoMark } from "@/components/onboarding/logo-mark";

interface SessionGateProps {
  authClient?: PhoneAuthClient;
  onNavigate?: (href: string) => void;
}

export function SessionGate({ authClient, onNavigate }: SessionGateProps) {
  const client = useMemo(() => authClient ?? createFirebasePhoneAuthClient(), [authClient]);
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
        navigate("/onboarding");
        return;
      }

      try {
        const me = await fetchCurrentDoctor(idToken);
        navigate(destinationForDoctorStatus(me.doctor.account_status));
      } catch {
        if (isMounted) {
          setMessage("We could not load your profile. Please sign in again.");
          navigate("/onboarding");
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
