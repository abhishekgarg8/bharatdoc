"use client";

import { Clock } from "lucide-react";
import { useState } from "react";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

interface PendingApprovalScreenProps {
  hospitalName?: string;
  ownerName?: string | null;
  requestedAt?: string | null;
  onSignOut?: () => void | Promise<void>;
}

function formatRequestedAt(requestedAt?: string | null): string {
  if (!requestedAt) {
    return "Not available";
  }

  const requestedDate = new Date(requestedAt);

  if (Number.isNaN(requestedDate.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(requestedDate);
}

export function PendingApprovalScreen({
  hospitalName = "your hospital",
  ownerName,
  requestedAt,
  onSignOut
}: PendingApprovalScreenProps) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (!onSignOut || signingOut) {
      return;
    }

    setSigningOut(true);

    try {
      await onSignOut();
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <OnboardingShell className="items-center justify-center px-7 py-10 text-center">
      <LogoMark size={48} />
      <div className="mt-12 flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-dashed border-ochre bg-saffron/10">
        <Clock className="h-12 w-12 text-ochre" />
      </div>
      <h1 className="mt-7 font-display text-[32px] italic leading-none tracking-normal text-ink">Waiting for approval</h1>
      <p className="mt-4 max-w-[320px] font-body text-sm leading-6 text-ink-soft">
        Your request to join <strong className="font-bold text-ink">{hospitalName}</strong> is pending review by the hospital
        owner. You will be notified once approved.
      </p>

      <div className="mt-7 w-full rounded-xl border border-rule bg-paper p-4 text-left">
        <InfoRow label="Requested on" value={formatRequestedAt(requestedAt)} />
        <InfoRow label="Owner" value={ownerName ?? "Hospital owner"} />
      </div>

      <div className="mt-auto w-full pt-10">
        <BharatButton variant="ghost" className="w-full" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? "Signing out..." : "Sign out"}
        </BharatButton>
      </div>
    </OnboardingShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-rule py-2.5 last:border-b-0">
      <span className="font-body text-xs text-ink-muted">{label}</span>
      <span className="font-body text-xs font-bold text-ink">{value}</span>
    </div>
  );
}
