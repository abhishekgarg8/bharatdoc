import { Clock } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

export function PendingApprovalScreen() {
  return (
    <OnboardingShell className="items-center justify-center px-7 py-10 text-center">
      <LogoMark size={48} />
      <div className="mt-12 flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-dashed border-ochre bg-saffron/10">
        <Clock className="h-12 w-12 text-ochre" />
      </div>
      <h1 className="mt-7 font-display text-[32px] italic leading-none tracking-normal text-ink">Waiting for approval</h1>
      <p className="mt-4 max-w-[320px] font-body text-sm leading-6 text-ink-soft">
        Your request to join <strong className="font-bold text-ink">Sunrise Clinic</strong> is pending review by the
        clinic owner. You will be notified once approved.
      </p>

      <div className="mt-7 w-full rounded-xl border border-rule bg-paper p-4 text-left">
        <InfoRow label="Requested on" value="23 Apr 2026, 09:14 AM" />
        <InfoRow label="Clinic code" value="MED42X" mono />
        <InfoRow label="Owner" value="Dr. Kavita Rao" />
      </div>

      <div className="mt-auto w-full pt-10">
        <BharatButton variant="ghost" className="w-full">
          Sign out
        </BharatButton>
      </div>
    </OnboardingShell>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-rule py-2.5 last:border-b-0">
      <span className="font-body text-xs text-ink-muted">{label}</span>
      <span className={mono ? "font-mono text-xs font-bold text-ink" : "font-body text-xs font-bold text-ink"}>{value}</span>
    </div>
  );
}
