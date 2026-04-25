"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { authErrorMessage, createSupabaseAuthClient, type AuthClient } from "@/lib/client/auth-client";

interface AccessRejectedScreenProps {
  authClient?: Pick<AuthClient, "signOut">;
  onNavigate?: (href: string) => void;
}

function canContinueAfterSignOutError(error: unknown): boolean {
  return error instanceof Error && error.message === "Supabase client environment is not configured.";
}

export function AccessRejectedScreen({ authClient, onNavigate }: AccessRejectedScreenProps) {
  const auth = useMemo(() => authClient ?? createSupabaseAuthClient(), [authClient]);
  const navigate = onNavigate ?? ((href: string) => window.location.assign(href));
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRetry() {
    navigate("/onboarding");
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);

    try {
      await auth.signOut();
      navigate("/onboarding");
    } catch (signOutError) {
      if (canContinueAfterSignOutError(signOutError)) {
        navigate("/onboarding");
      } else {
        setError(authErrorMessage(signOutError));
      }
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <OnboardingShell className="items-center justify-center px-7 py-10 text-center">
      <LogoMark size={48} />
      <div className="mt-12 flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-stamp/25 bg-stamp/10">
        <AlertTriangle className="h-12 w-12 text-stamp" />
      </div>
      <h1 className="mt-7 font-display text-[32px] italic leading-none tracking-normal text-ink">Access not granted</h1>
      <p className="mt-4 max-w-[320px] font-body text-sm leading-6 text-ink-soft">
        Your hospital owner did not approve this BharatDoc account. Select the correct hospital and try again.
      </p>
      {error ? (
        <div className="mt-5 w-full rounded-lg border border-stamp/20 bg-stamp/10 px-3 py-2 font-body text-xs text-stamp" role="alert">
          {error}
        </div>
      ) : null}
      <div className="mt-auto grid w-full gap-3 pt-10">
        <BharatButton className="w-full" onClick={handleRetry}>
          Join a different hospital
        </BharatButton>
        <BharatButton className="w-full" variant="ghost" onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign out
        </BharatButton>
      </div>
    </OnboardingShell>
  );
}
