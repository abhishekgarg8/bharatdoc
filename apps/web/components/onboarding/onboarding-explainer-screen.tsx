"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, MailCheck, Mic, UserPlus } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { LogoMark } from "@/components/onboarding/logo-mark";
import { OnboardingShell } from "@/components/onboarding/onboarding-shell";

const signupHref = "/signup";
const steps = [
  {
    title: "Create your account",
    body: "Sign up with your details so BharatDoc can set up your workspace and keep your consultation records organized.",
    Icon: UserPlus,
    preview: "account"
  },
  {
    title: "Confirm your email",
    body: "Open the confirmation email and verify your address so your account is ready to use.",
    Icon: MailCheck,
    preview: "email"
  },
  {
    title: "Start recording and transcribing",
    body: "Begin a consultation recording or transcription workflow, then review the generated notes before using them.",
    Icon: Mic,
    preview: "record"
  }
] as const;

export function OnboardingExplainerScreen() {
  const [index, setIndex] = useState(0);
  const step = steps[index]!;
  const StepIcon = step.Icon;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  return (
    <OnboardingShell>
      <section className="flex min-h-dvh flex-1 flex-col px-7 py-9">
        <div className="flex items-center justify-between">
          <LogoMark size={36} />
          <a className="font-body text-sm font-bold text-terracotta underline-offset-4 hover:underline" href={signupHref}>
            Skip
          </a>
        </div>

        <div className="flex flex-1 flex-col justify-center py-8">
          <div className="mb-8 flex justify-center" aria-hidden="true">
            <StepPreview kind={step.preview} />
          </div>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rule bg-paper-deep text-terracotta">
            <StepIcon className="h-6 w-6" />
          </div>
          <p className="font-body text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
            Step {index + 1} of {steps.length}
          </p>
          <h1 className="mt-3 font-display text-[42px] italic leading-none tracking-normal text-ink">{step.title}</h1>
          <p className="mt-4 font-body text-base leading-7 text-ink-muted">{step.body}</p>

          <div className="mt-7 flex items-center gap-2" aria-label="Onboarding explainer progress">
            {steps.map((item, itemIndex) => (
              <button
                key={item.title}
                type="button"
                className={
                  itemIndex === index
                    ? "h-2.5 w-8 rounded-full bg-terracotta"
                    : "h-2.5 w-2.5 rounded-full bg-rule"
                }
                aria-label={`Show ${item.title}`}
                aria-current={itemIndex === index ? "step" : undefined}
                onClick={() => setIndex(itemIndex)}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-3">
          <BharatButton
            aria-label="Previous onboarding screen"
            disabled={isFirst}
            variant="ghost"
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            <ArrowLeft className="h-4 w-4" />
          </BharatButton>
          {isLast ? (
            <a
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta px-4 py-3 font-body text-sm font-bold tracking-[0.01em] text-white shadow-warm transition active:scale-[0.99]"
              href={signupHref}
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </a>
          ) : (
            <BharatButton onClick={() => setIndex((current) => Math.min(steps.length - 1, current + 1))}>
              Next
              <ArrowRight className="h-4 w-4" />
            </BharatButton>
          )}
        </div>
      </section>
    </OnboardingShell>
  );
}

function StepPreview({ kind }: { kind: (typeof steps)[number]["preview"] }) {
  if (kind === "email") {
    return (
      <div className="relative h-44 w-full max-w-[300px] rounded-[22px] border border-rule bg-paper-deep p-5 shadow-[0_12px_35px_rgba(28,23,18,0.08)]">
        <div className="h-4 w-24 rounded-full bg-rule" />
        <div className="mt-5 rounded-2xl border border-rule bg-paper p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage/15 text-sage">
              <Check className="h-5 w-5" />
            </span>
            <div>
              <div className="h-3 w-32 rounded-full bg-ink/20" />
              <div className="mt-2 h-2.5 w-24 rounded-full bg-rule" />
            </div>
          </div>
        </div>
        <div className="absolute -bottom-4 right-8 rounded-full bg-terracotta px-4 py-2 font-body text-xs font-bold text-white">
          Verified
        </div>
      </div>
    );
  }

  if (kind === "record") {
    return (
      <div className="h-44 w-full max-w-[300px] rounded-[22px] border border-rule bg-paper-deep p-5 shadow-[0_12px_35px_rgba(28,23,18,0.08)]">
        <div className="flex items-center justify-between">
          <div className="h-3 w-28 rounded-full bg-ink/20" />
          <span className="rounded-full bg-stamp/10 px-3 py-1 font-mono text-[10px] font-bold text-stamp">REC</span>
        </div>
        <div className="mt-8 flex h-16 items-end justify-center gap-2">
          {[22, 44, 30, 58, 36, 50, 26].map((height) => (
            <span key={height} className="w-3 rounded-full bg-terracotta" style={{ height }} />
          ))}
        </div>
        <div className="mt-6 h-3 rounded-full bg-rule" />
        <div className="mt-3 h-3 w-4/5 rounded-full bg-rule" />
      </div>
    );
  }

  return (
    <div className="h-44 w-full max-w-[300px] rounded-[22px] border border-rule bg-paper-deep p-5 shadow-[0_12px_35px_rgba(28,23,18,0.08)]">
      <div className="flex items-center gap-3">
        <span className="h-12 w-12 rounded-2xl bg-sage/20" />
        <div className="flex-1">
          <div className="h-3 w-28 rounded-full bg-ink/20" />
          <div className="mt-3 h-2.5 w-20 rounded-full bg-rule" />
        </div>
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-10 rounded-xl border border-rule bg-paper" />
        <div className="h-10 rounded-xl border border-rule bg-paper" />
      </div>
      <div className="mt-5 h-9 rounded-xl bg-terracotta" />
    </div>
  );
}
