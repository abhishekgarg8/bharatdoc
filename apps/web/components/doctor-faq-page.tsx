import { ArrowRight, CheckCircle2, ShieldCheck, Stethoscope } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/onboarding/logo-mark";

const doctorFaqs = [
  {
    question: "What is BharatDoc?",
    answer:
      "BharatDoc helps doctors capture, organize, and work with clinical conversations more efficiently. It is designed to reduce repetitive documentation effort so doctors can spend more attention on patients while still reviewing the final record carefully."
  },
  {
    question: "Who is BharatDoc built for?",
    answer:
      "BharatDoc is built for doctors, clinics, and small care teams that want a faster way to manage consultation notes, summaries, PDFs, and Patient ID lookup. It can support individual doctors as well as hospital workspaces where an owner reviews doctor access."
  },
  {
    question: "Is BharatDoc currently free?",
    answer:
      "BharatDoc is currently free to use while we are in our early access and launch phase. We expect to introduce paid plans soon as the product matures. Before any paid pricing is introduced, we will communicate the details clearly so doctors and clinics can decide which plan fits their needs."
  },
  {
    question: "When will pricing start, and what will paid plans include?",
    answer:
      "We are still finalizing paid plans. Our goal is to keep pricing simple and practical for doctors and clinics. Future plans may consider usage, clinic size, advanced workflow features, storage, integrations, or support level, but exact plan details are not final yet."
  },
  {
    question: "Is patient data safe and private?",
    answer:
      "We treat patient information as sensitive and continue to strengthen privacy and security practices as BharatDoc evolves. Doctors should use BharatDoc in line with their clinical, institutional, and legal obligations. We do not claim a specific legal certification, compliance status, or encryption standard unless it has been formally verified and published."
  },
  {
    question: "Do I need patient consent before recording or transcribing a consultation?",
    answer:
      "Doctors should obtain patient consent whenever recording, transcribing, or processing a consultation is required by their clinic, hospital, professional guidance, or local regulations. BharatDoc should be used as part of a consent-aware clinical workflow, not as a substitute for that judgment."
  },
  {
    question: "How accurate are BharatDoc's notes or transcripts?",
    answer:
      "BharatDoc can help generate drafts and summaries, but doctors should review, edit, and approve all output before relying on it for clinical records or patient communication. The doctor remains responsible for the final clinical judgment and documentation."
  },
  {
    question: "Can I edit the generated notes?",
    answer:
      "Yes. The workflow is designed for doctor review. After transcription, doctors can generate an AI-drafted summary, edit the text, save the final summary, and then create the PDF record linked to the Patient ID."
  },
  {
    question: "Which languages, accents, and specialties are supported?",
    answer:
      "BharatDoc includes transcription settings for auto-detect, Hindi, English, and Hinglish. Accuracy still depends on audio clarity, background noise, speaker overlap, specialty terminology, medication names, and pronunciation, so doctors should review generated content carefully."
  },
  {
    question: "Can BharatDoc fit into my clinic or hospital workflow?",
    answer:
      "BharatDoc is designed for everyday consultation documentation: record the visit, transcribe when ready, review the AI-drafted summary, save the PDF, and search later by Patient ID. Clinics can try the current workflow before paid plans arrive and separately evaluate any required approvals or integrations."
  },
  {
    question: "Does BharatDoc replace my EMR or EHR?",
    answer:
      "No. BharatDoc is not positioned as a full EMR or EHR replacement. It helps create and organize consultation documentation, but clinics should decide how BharatDoc output fits with their official medical record, billing, reporting, and institutional systems."
  },
  {
    question: "How do I get support or request features?",
    answer:
      "Doctors can route support requests through their hospital administrator or BharatDoc contact. Include the patient ID, approximate consultation time, browser or device details, and a short description of the issue so the team can investigate quickly."
  }
];

const trustNotes = [
  {
    title: "Doctor-reviewed",
    body: "AI output is treated as a draft until the doctor checks and saves it.",
    Icon: Stethoscope
  },
  {
    title: "Consent-aware",
    body: "Recording and transcription should follow clinic, hospital, and local requirements.",
    Icon: ShieldCheck
  },
  {
    title: "Pricing clarity",
    body: "Free during early access, with paid plans expected to be announced clearly later.",
    Icon: CheckCircle2
  }
];

export function DoctorFaqPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-paper font-body text-ink">
      <nav className="sticky top-0 z-50 border-b border-rule bg-paper/90 backdrop-blur-md" aria-label="FAQ navigation">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="BharatDoc home">
            <LogoMark size={32} />
            <span className="font-display text-lg italic leading-none text-ink">BharatDoc</span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link href="/" className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
              Home
            </Link>
            <Link href="/help-center" className="hidden text-sm text-ink-muted transition-colors hover:text-ink sm:inline">
              Help
            </Link>
            <Link href="/onboarding" className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-ink">
              Log in
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-terracotta px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_rgba(194,74,42,0.35)] transition-opacity hover:opacity-90 sm:px-5"
            >
              Get started
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </nav>

      <main>
        <header
          className="relative overflow-hidden border-b border-rule"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(250,245,234,0.98) 0%, rgba(250,245,234,0.88) 36%, rgba(250,245,234,0.56) 64%, rgba(250,245,234,0.18) 100%), url('/images/bharatdoc-hero-clinic-consultation-recording.png')",
            backgroundPosition: "center",
            backgroundSize: "cover"
          }}
        >
          <div className="mx-auto grid min-h-[48svh] max-w-6xl items-end gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1fr_360px] lg:py-20">
            <div className="max-w-3xl">
              <p className="font-mono text-xs uppercase tracking-widest text-terracotta">BharatDoc FAQs</p>
              <h1 className="mt-4 max-w-[11ch] font-display text-[48px] italic leading-[0.98] text-ink sm:text-[64px] lg:text-[76px]">
                FAQs for doctors
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ink-soft sm:text-xl">
                Practical answers for doctors and clinic decision-makers evaluating pricing, privacy, consent, clinical accuracy, and day-to-day workflow fit.
              </p>
            </div>

            <aside className="grid gap-3 rounded-[8px] border border-rule bg-paper/88 p-4 shadow-[0_12px_34px_rgba(28,23,18,0.12)] backdrop-blur-sm">
              {trustNotes.map(({ title, body, Icon }) => (
                <div key={title} className="flex gap-3 border-b border-rule pb-3 last:border-b-0 last:pb-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-deep text-terracotta">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-ink">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-ink-muted">{body}</span>
                  </span>
                </div>
              ))}
            </aside>
          </div>
        </header>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16" aria-label="Doctor FAQ answers">
          <div className="grid gap-4 lg:grid-cols-2">
            {doctorFaqs.map((faq, index) => (
              <article key={faq.question} className="rounded-[8px] border border-rule bg-paper-deep p-5 shadow-[0_1px_0_#E5DAC5] sm:p-6">
                <div className="mb-4 h-[3px] w-10 rounded-full bg-terracotta" aria-hidden="true" />
                <p className="font-mono text-xs uppercase tracking-widest text-ink-faint">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-2 font-display text-[27px] italic leading-snug text-ink">{faq.question}</h2>
                <p className="mt-3 text-[15px] leading-7 text-ink-muted">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-rule bg-paper-deep">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-terracotta">Ready to evaluate it?</p>
              <p className="mt-2 max-w-xl text-lg leading-7 text-ink-soft">
                Try BharatDoc in a real consultation workflow and decide where it saves your clinic time.
              </p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-terracotta px-7 py-3 font-semibold text-white shadow-warm transition-opacity hover:opacity-90"
            >
              Start using BharatDoc
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-display italic text-ink">BharatDoc</span>
          </div>
          <nav className="flex flex-wrap items-center gap-6" aria-label="Footer navigation">
            <Link href="/" className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-ink">
              Home
            </Link>
            <Link href="/terms-privacy?page=terms" className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-ink">
              Terms
            </Link>
            <Link href="/terms-privacy?page=privacy" className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/help-center" className="inline-flex min-h-11 items-center text-sm text-ink-muted transition-colors hover:text-ink">
              Help
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
