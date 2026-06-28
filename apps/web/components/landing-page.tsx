import Link from "next/link";
import { LogoMark } from "@/components/onboarding/logo-mark";

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-rule bg-paper px-3.5 py-2.5 shadow-[0_4px_16px_rgba(28,23,18,0.10)]">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-paper-deep">
        {icon}
      </div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">{label}</div>
        <div className="font-mono text-sm font-semibold leading-tight text-ink">{value}</div>
      </div>
    </div>
  );
}

function PhoneMockup() {
  return (
    <div
      className="relative h-[560px] w-[272px] rounded-[44px] shadow-[0_32px_80px_rgba(28,23,18,0.32),0_0_0_10px_#1a1410,0_0_0_11px_rgba(255,255,255,0.06)]"
      style={{ background: "#1a1410" }}
    >
      {/* Dynamic Island */}
      <div className="absolute left-1/2 top-3 h-7 w-24 -translate-x-1/2 rounded-full bg-black" />

      {/* Screen */}
      <div className="absolute inset-[10px] overflow-hidden rounded-[36px] bg-paper">
        <div className="h-full overflow-hidden pt-11 px-4 pb-4">
          {/* Header */}
          <div className="mb-5">
            <p className="font-mono text-[10px] text-ink-muted">Good morning</p>
            <p className="font-display italic text-xl leading-tight text-ink">Dr. Sharma</p>
          </div>

          {/* Stats row */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-paper-deep p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">Today</p>
              <p className="mt-0.5 font-display italic text-2xl leading-none text-terracotta">14</p>
              <p className="mt-0.5 text-[9px] text-ink-muted">patients seen</p>
            </div>
            <div className="rounded-xl bg-paper-deep p-3">
              <p className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">Pending</p>
              <p className="mt-0.5 font-display italic text-2xl leading-none text-saffron">2</p>
              <p className="mt-0.5 text-[9px] text-ink-muted">notes</p>
            </div>
          </div>

          {/* Section label */}
          <p className="mb-2 font-mono text-[9px] uppercase tracking-widest text-ink-muted">Recent notes</p>

          {/* Note rows */}
          {[
            { name: "Ramesh Kumar", time: "10:32 AM", tag: "SOAP", done: true },
            { name: "Priya Mehta", time: "9:15 AM", tag: "DC", done: true },
            { name: "Arun Verma", time: "Yesterday", tag: "Ref", done: false },
          ].map((note, i) => (
            <div
              key={i}
              className="mb-1.5 flex items-center justify-between rounded-lg border border-rule bg-white/50 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold text-ink">{note.name}</p>
                <p className="text-[8px] text-ink-muted">{note.time}</p>
              </div>
              <span
                className={`ml-2 flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] ${
                  note.done ? "bg-sage/10 text-sage" : "bg-rule text-ink-muted"
                }`}
              >
                {note.tag}
              </span>
            </div>
          ))}

          {/* Record button */}
          <div className="mt-5 flex flex-col items-center gap-1">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta shadow-[0_4px_16px_rgba(194,74,42,0.45)]">
              {/* Mic icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <p className="font-mono text-[8px] uppercase tracking-widest text-ink-muted">Tap to record</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper font-body text-ink">
      {/* ── Nav ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-rule bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <LogoMark size={32} />
            <span className="font-display italic text-lg leading-none text-ink">BharatDoc</span>
          </div>
          <div className="flex items-center gap-5">
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
      <section className="relative pt-20 pb-0">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-center justify-between gap-8">
            {/* Left column */}
            <div className="w-full max-w-[520px] flex-shrink-0 pb-24">
              {/* Tag pill */}
              <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-rule bg-paper-deep px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-terracotta" />
                <span className="font-mono text-xs text-ink-muted">
                  AI documentation for Indian clinics
                </span>
              </div>

              {/* Headline */}
              <h1
                className="mb-6 font-display italic leading-[1.04] text-ink"
                style={{ fontSize: "clamp(52px, 6vw, 80px)" }}
              >
                Document smarter.
                <br />
                Care deeper.
              </h1>

              {/* Body */}
              <p className="mb-10 max-w-[400px] text-lg leading-relaxed text-ink-muted">
                BharatDoc turns your patient consultations into structured
                clinical notes in under 2 minutes — so you can focus on
                medicine, not paperwork.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/onboarding"
                  className="flex items-center gap-2 rounded-full bg-terracotta px-8 py-3.5 font-semibold text-white shadow-[0_6px_24px_rgba(194,74,42,0.38),0_2px_0_rgba(0,0,0,0.08)] transition-opacity hover:opacity-90"
                >
                  Get started free
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
                <a
                  href="#how-it-works"
                  className="flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
                >
                  See how it works
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Right column — phone */}
            <div className="relative flex flex-shrink-0 items-end pb-0">
              {/* Stat chip — top left */}
              <div className="absolute -left-10 top-8 z-10">
                <StatChip
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C24A2A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  }
                  label="Notes this week"
                  value="47"
                />
              </div>

              {/* Stat chip — bottom right */}
              <div className="absolute -right-4 bottom-32 z-10">
                <StatChip
                  icon={
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5F7A52" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  }
                  label="Avg. processing"
                  value="< 2 min"
                />
              </div>

              {/* Phone — tilted */}
              <div style={{ transform: "rotate(6deg)", transformOrigin: "bottom center", marginBottom: "-1px" }}>
                <PhoneMockup />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom rule */}
        <div className="border-t border-rule" />
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section id="how-it-works" className="py-28">
        <div className="mx-auto max-w-6xl px-6">
          {/* Section header */}
          <div className="mb-20">
            <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">
              Simple by design
            </span>
            <h2 className="mt-3 font-display italic text-[48px] leading-tight text-ink">
              How BharatDoc works
            </h2>
          </div>

          {/* Steps */}
          <div className="grid grid-cols-3 gap-12">
            {[
              {
                num: "01",
                title: "Record",
                desc: "Speak naturally during your consultation. BharatDoc listens in the background — even in noisy clinic environments.",
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
                title: "Transcribe",
                desc: "Our AI converts your conversation into a structured clinical note — SOAP, discharge summary, or referral letter — in under 2 minutes.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C24A2A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
              {
                num: "03",
                title: "Share",
                desc: "Send the note to the patient via WhatsApp, download as PDF, or save to your clinic records instantly.",
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C24A2A" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
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
            <h2 className="mt-3 font-display italic text-[48px] leading-tight text-ink">
              Everything you need,
              <br />
              nothing you don&apos;t
            </h2>
          </div>

          {/* 2×2 grid */}
          <div className="grid grid-cols-2 gap-5">
            {[
              {
                bar: "bg-terracotta",
                title: "Voice-first, always",
                desc: "No keyboards, no forms. Just speak — BharatDoc handles the rest. Works in Hindi, Tamil, Telugu, Bengali, and more Indian languages.",
              },
              {
                bar: "bg-saffron",
                title: "Clinically structured",
                desc: "Every note follows SOAP or your clinic's custom template. Drug names, dosages, and ICD codes are auto-detected and validated.",
              },
              {
                bar: "bg-sage",
                title: "WhatsApp native",
                desc: "Share discharge summaries and prescription notes directly to patients' WhatsApp — no app install required on their end.",
              },
              {
                bar: "bg-indigo",
                title: "Clinic management",
                desc: "Manage your team, set note templates, review pending approvals, and track documentation metrics — all in one dashboard.",
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
          <div className="relative overflow-hidden rounded-3xl bg-terracotta px-16 py-24 text-center">
            {/* Subtle texture rings */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" />
              <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border border-white/10" />
              <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full border border-white/10" />
            </div>

            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-white/60">
              Start today
            </p>
            <h2 className="mb-5 font-display italic text-[52px] leading-tight text-white">
              Ready to document better?
            </h2>
            <p className="mx-auto mb-10 max-w-md text-lg leading-relaxed text-white/75">
              Join hundreds of doctors across India who save 2+ hours every day with BharatDoc.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-full bg-paper px-10 py-4 font-semibold text-terracotta shadow-[0_4px_24px_rgba(0,0,0,0.18)] transition-opacity hover:opacity-90"
            >
              Get started free
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
