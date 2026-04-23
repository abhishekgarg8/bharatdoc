import { Building2, FileText, Plus } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";
import { LogoMark } from "@/components/onboarding/logo-mark";

export function OnboardingScreen() {
  return (
    <OnboardingShell>
      <section className="flex flex-1 flex-col px-7 py-10">
        <LogoMark />

        <div className="mt-10">
          <h1 className="font-display text-[40px] italic leading-none tracking-normal text-ink">Welcome to BharatDoc</h1>
          <p className="mt-3 max-w-[320px] font-body text-sm leading-6 text-ink-muted">
            Record consultations. Get AI-drafted clinical summaries. Save to PDF in one tap.
          </p>
        </div>

        <div className="mt-9">
          <label className="mb-1.5 block font-body text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
            Mobile number
          </label>
          <div className="flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-terracotta bg-paper px-3.5 py-3">
            <span className="border-r border-rule pr-3 font-mono text-[15px] font-bold text-ink">+91</span>
            <span className="font-mono text-lg font-bold tracking-[0.08em] text-ink">98765 43210</span>
          </div>
          <p className="mt-2 font-body text-[11px] text-ink-muted">We will send a 6-digit OTP via SMS.</p>
        </div>

        <div className="mt-8 rounded-[14px] border border-rule bg-paper p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-terracotta" />
            <h2 className="font-body text-sm font-bold text-ink">Profile details</h2>
          </div>
          <div className="grid gap-3">
            <ReadOnlyField label="Full name" value="Dr. Aparna Iyer" />
            <ReadOnlyField label="Specialization" value="General Physician" />
            <ReadOnlyField label="Medical registration no." value="Optional" muted />
          </div>
        </div>

        <div className="mt-4 rounded-[14px] border-[1.5px] border-terracotta bg-paper p-4 shadow-[0_4px_12px_rgba(194,74,42,0.08)]">
          <div className="mb-2 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-terracotta" />
            <h2 className="font-body text-sm font-bold text-ink">Join an existing clinic</h2>
          </div>
          <p className="font-body text-xs leading-5 text-ink-muted">Enter the 6-character code shared by your clinic owner.</p>
          <div className="mt-3 rounded-lg border border-rule bg-paper-deep px-3 py-2">
            <div className="font-body text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">Clinic found</div>
            <div className="mt-1 font-display text-[22px] italic leading-none text-ink">Sunrise Clinic</div>
            <div className="mt-1 font-body text-[11px] text-ink-muted">Baner Road, Pune - 3 doctors</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-rule" />
          <span className="font-body text-[10px] font-bold uppercase tracking-[0.14em] text-ink-faint">or</span>
          <div className="h-px flex-1 bg-rule" />
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-rule bg-paper-deep p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-rule bg-paper text-ink-soft">
            <Plus className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-body text-sm font-bold text-ink">Create a new clinic</div>
            <div className="mt-0.5 font-body text-[11.5px] leading-5 text-ink-muted">
              You will become the owner and can approve other doctors.
            </div>
          </div>
        </div>

        <div className="mt-auto pt-7">
          <BharatButton className="w-full">Continue</BharatButton>
          <p className="mt-4 text-center font-body text-[11px] leading-5 text-ink-faint">
            By continuing you agree to BharatDoc terms and privacy policy.
          </p>
        </div>
      </section>
    </OnboardingShell>
  );
}

function ReadOnlyField({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="mb-1 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</div>
      <div className="rounded-[10px] border border-rule bg-paper-deep px-3 py-2 font-body text-sm font-semibold text-ink">
        <span className={muted ? "text-ink-faint" : undefined}>{value}</span>
      </div>
    </div>
  );
}
