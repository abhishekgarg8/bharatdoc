import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "@/components/onboarding/logo-mark";

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper font-body text-ink">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="font-display italic text-lg leading-none text-ink">BharatDoc</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/faqs"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              FAQs
            </Link>
            <Link
              href="/onboarding"
              className="text-sm text-ink-muted transition-colors hover:text-ink"
            >
              Log in
            </Link>
            <Link
              href="/onboarding"
              className="flex items-center gap-1.5 rounded-full bg-terracotta px-5 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(194,74,42,0.35)] transition-opacity hover:opacity-90"
            >
              Get started
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative min-h-[calc(100svh-165px)] overflow-hidden border-b border-rule">
        <Image
          src="/images/bharatdoc-hero-clinic-consultation-recording.png"
          alt="Indian doctor reviewing a consultation with a patient while a phone records on the desk"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[66%_center] sm:object-[60%_center] lg:object-center"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(250,245,234,0.96) 0%, rgba(250,245,234,0.86) 29%, rgba(250,245,234,0.48) 52%, rgba(250,245,234,0.12) 78%), linear-gradient(180deg, rgba(250,245,234,0.72) 0%, rgba(250,245,234,0.10) 36%, rgba(28,23,18,0.16) 100%)"
          }}
        />
        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-165px)] max-w-6xl items-start px-4 py-14 sm:px-6 sm:py-16 lg:items-center lg:py-20">
          <div className="w-full max-w-[590px] pt-5 sm:pt-8 lg:pt-0">
            {/* Headline */}
            <h1
              className="mb-7 max-w-[9ch] font-display italic leading-[1.02] text-ink sm:max-w-[12ch]"
              style={{ fontSize: "clamp(48px, 7vw, 84px)" }}
            >
              AI Scribe for Indian clinics
            </h1>

            {/* Body */}
            <p className="mb-9 max-w-[430px] text-[22px] leading-snug text-ink-soft sm:text-2xl">
              Turn every consultation into an AI-drafted, doctor-reviewed summary and Patient ID PDF.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/onboarding"
                className="flex items-center gap-2 rounded-full bg-terracotta px-8 py-3.5 font-semibold text-white shadow-[0_6px_24px_rgba(194,74,42,0.38),0_2px_0_rgba(0,0,0,0.08)] transition-opacity hover:opacity-90"
              >
                Get started
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 rounded-full bg-paper/70 px-4 py-3 text-sm font-medium text-ink-muted shadow-[0_3px_14px_rgba(28,23,18,0.08)] backdrop-blur-sm transition-colors hover:text-ink"
              >
                See how it works
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section id="how-it-works" className="pb-28 pt-12">
        <div className="mx-auto max-w-6xl px-6">
          {/* Section header */}
          <div className="mb-14 sm:mb-20">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">
              Simple by design
            </span>
            <h2 className="mt-3 font-display italic text-[40px] leading-tight text-ink sm:text-[48px]">
              How BharatDoc works
            </h2>
          </div>

          {/* Steps */}
          <div className="grid gap-12 md:grid-cols-3">
            {[
              {
                num: "01",
                title: "Record",
                desc: "Start recording during the consultation. Audio can stay saved locally when the clinic connection is unreliable.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C24A2A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                  </svg>
                ),
              },
              {
                num: "02",
                title: "Review",
                desc: "Generate a transcript and AI-drafted clinical summary, then check and edit it before it becomes part of the record.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C24A2A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
              {
                num: "03",
                title: "Save",
                desc: "Save the finalized summary as a PDF record linked to a Patient ID, ready for clinic-scoped lookup later.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C24A2A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                ),
              },
            ].map((step) => (
              <div key={step.num} className="relative">
                {/* Ghost number */}
                <div
                  className="absolute right-0 top-0 select-none font-display italic leading-none text-rule"
                  style={{ fontSize: 120, lineHeight: 1, marginTop: "-0.15em" }}
                  aria-hidden="true"
                >
                  {step.num}
                </div>

                <div className="relative z-10">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-rule bg-paper-deep">
                    {step.icon}
                  </div>
                  <h3 className="mb-3 font-display italic text-[26px] leading-snug text-ink">
                    {step.title}
                  </h3>
                  <p className="leading-relaxed text-ink-muted">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-28 border-t border-rule" />
      </section>

      {/* ── Feature cards ────────────────────────────────────────── */}
      <section className="py-28">
        <div className="mx-auto max-w-6xl px-6">
          {/* Section header */}
          <div className="mb-16">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">
              Built for Indian clinics
            </span>
            <h2 className="mt-3 font-display italic text-[40px] leading-tight text-ink sm:text-[48px]">
              Everything you need,
              <br />
              nothing you don&apos;t
            </h2>
          </div>

          {/* 2×2 grid */}
          <div className="grid gap-5 md:grid-cols-2">
            {[
              {
                bar: "bg-terracotta",
                title: "Voice-first workflow",
                desc: "Start from the consultation itself, not a blank form. Capture the conversation and decide when to transcribe it.",
              },
              {
                bar: "bg-saffron",
                title: "Doctor-reviewed summaries",
                desc: "AI drafts the clinical summary, but the doctor reviews, edits, and saves the final note before PDF generation.",
              },
              {
                bar: "bg-sage",
                title: "Offline-safe recording",
                desc: "Recordings can be saved locally on the device when connectivity is poor, then processed manually when online.",
              },
              {
                bar: "bg-indigo",
                title: "Clinic-scoped records",
                desc: "Patient ID search, owner approval, doctor settings, and clinic context stay tied to the hospital workspace.",
              },
            ].map((card, i) => (
              <div
                key={i}
                className="group rounded-2xl border border-rule bg-paper-deep p-8 transition-all duration-200 hover:bg-paper hover:shadow-[0_8px_32px_rgba(28,23,18,0.08)]"
              >
                <div className={`mb-7 h-[3px] w-10 rounded-full ${card.bar}`} />
                <h3 className="mb-3 font-display italic text-[24px] leading-snug text-ink">
                  {card.title}
                </h3>
                <p className="leading-relaxed text-ink-muted">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-28 border-t border-rule" />
      </section>

      {/* ── CTA block ───────────────────────────────────────────── */}
      <section className="py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative overflow-hidden rounded-3xl bg-terracotta px-6 py-20 text-center sm:px-16 sm:py-24">
            {/* Subtle texture rings */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-white/10" />
              <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-white/10" />
            </div>

            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-white/60">
              Start today
            </p>
            <h2 className="mb-5 font-display italic text-[40px] leading-tight text-white sm:text-[52px]">
              Start with your next consultation
            </h2>
            <p className="mx-auto mb-10 max-w-md text-lg leading-relaxed text-white/75">
              Record the visit, review the AI-assisted summary, and save a PDF record your clinic can find later.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-full bg-paper px-10 py-4 font-semibold text-terracotta shadow-[0_4px_24px_rgba(0,0,0,0.18)] transition-opacity hover:opacity-90"
            >
              Get started
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <LogoMark size={28} />
              <span className="font-display italic text-ink">BharatDoc</span>
            </div>
            <nav className="flex items-center gap-6" aria-label="Footer navigation">
              <Link
                href="/terms-privacy?page=terms"
                className="text-sm text-ink-muted transition-colors hover:text-ink"
              >
                Terms
              </Link>
              <Link
                href="/terms-privacy?page=privacy"
                className="text-sm text-ink-muted transition-colors hover:text-ink"
              >
                Privacy
              </Link>
              <Link
                href="/help-center"
                className="text-sm text-ink-muted transition-colors hover:text-ink"
              >
                Help
              </Link>
            </nav>
          </div>
          <div className="mt-8 text-xs text-ink-faint">
            © {new Date().getFullYear()} BharatDoc. Built for Indian doctors.
          </div>
        </div>
      </footer>
    </div>
  );
}
