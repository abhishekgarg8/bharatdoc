import { AlertTriangle } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export function AccessRejectedScreen() {
  return (
    <OnboardingShell className="items-center justify-center px-7 py-10 text-center">
      <LogoMark size={48} />
      <div className="mt-12 flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-stamp/25 bg-stamp/10">
        <AlertTriangle className="h-12 w-12 text-stamp" />
      </div>
      <h1 className="mt-7 font-display text-[32px] italic leading-none tracking-normal text-ink">Access not granted</h1>
      <p className="mt-4 max-w-[320px] font-body text-sm leading-6 text-ink-soft">
        Your clinic owner did not approve this BharatDoc account. Use the clinic code shared by your owner and try again.
      </p>
      <div className="mt-auto w-full pt-10">
        <BharatButton className="w-full">Join a different clinic</BharatButton>
      </div>
    </OnboardingShell>
  );
}
