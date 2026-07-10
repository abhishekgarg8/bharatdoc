"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { ApiResponseError } from "@/lib/client/api-error";
import { createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";
import { destinationForDoctorStatus, fetchCurrentDoctor } from "@/lib/client/session";

type CallbackState = "loading" | "success" | "error";

interface AuthCallbackPageClientProps {
  authClient?: Pick<AuthClient, "recoverSessionFromUrl">;
  fetchDoctor?: typeof fetchCurrentDoctor;
  onNavigate?: (href: string) => void;
}

export function AuthCallbackPageClient({
  authClient,
  fetchDoctor = fetchCurrentDoctor,
  onNavigate
}: AuthCallbackPageClientProps) {
  const auth = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = onNavigate ?? ((href: string) => window.location.assign(href));
  const [state, setState] = useState<CallbackState>("loading");

  useEffect(() => {
    let isMounted = true;
    const callbackHref = window.location.href;
    window.history.replaceState(null, "", "/auth/callback");

    async function confirmEmail() {
      try {
        const idToken = await auth.recoverSessionFromUrl?.(callbackHref);

        if (!idToken) {
          throw new Error("Missing Supabase confirmation handler.");
        }

        let destination: string;

        try {
          const me = await fetchDoctor(idToken);
          destination = destinationForDoctorStatus(me.doctor.accountStatus);
        } catch (profileError) {
          if (profileError instanceof ApiResponseError && profileError.code === "PROFILE_NOT_FOUND") {
            destination = "/signup?confirmed=1";
          } else {
            throw profileError;
          }
        }

        if (!isMounted) {
          return;
        }

        setState("success");
        navigate(destination);
      } catch {
        if (isMounted) {
          setState("error");
        }
      }
    }

    void confirmEmail();

    return () => {
      isMounted = false;
    };
  }, [auth, fetchDoctor, navigate]);

  if (state === "error") {
    return (
      <OnboardingShell className="items-center justify-center px-7 py-10 text-center">
        <LogoMark size={48} />
        <div className="mt-12 flex h-[112px] w-[112px] items-center justify-center rounded-full border-2 border-stamp/25 bg-stamp/10">
          <AlertTriangle className="h-11 w-11 text-stamp" />
        </div>
        <h1 className="mt-7 font-display text-[30px] italic leading-none tracking-normal text-ink">Link did not work</h1>
        <p className="mt-4 max-w-[320px] font-body text-sm leading-6 text-ink-soft">
          This confirmation link may be expired or already used. Log in if you already confirmed your email, or retry
          signup to request a fresh link.
        </p>
        <div className="mt-auto grid w-full gap-3 pt-10">
          <BharatButton className="w-full" onClick={() => navigate("/signup")}>
            Log in or retry signup
          </BharatButton>
          <BharatButton className="w-full" variant="ghost" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4" />
            Retry link
          </BharatButton>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell className="items-center justify-center px-8 text-center">
      <LogoMark />
      {state === "success" ? (
        <CheckCircle2 className="mt-8 h-8 w-8 text-sage" />
      ) : (
        <Loader2 className="mt-8 h-7 w-7 animate-spin text-terracotta" />
      )}
      <p className="mt-4 font-body text-sm text-ink-muted">
        {state === "success" ? "Email confirmed. Opening BharatDoc..." : "Confirming your email"}
      </p>
    </OnboardingShell>
  );
}
