import { ArrowLeft } from "lucide-react";
import Link from "next/link";

interface InfoSection {
  title: string;
  body: string;
}

interface StaticInfoPageProps {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  sections: InfoSection[];
}

export function StaticInfoPage({ eyebrow, title, description, updatedAt, sections }: StaticInfoPageProps) {
  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg min-h-dvh px-5 pb-10 pt-5">
        <Link
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-rule bg-paper px-3 py-2 font-body text-xs font-bold text-ink-soft transition active:scale-[0.99]"
          href="/settings"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>

        <header className="border-b border-rule pb-5">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">{eyebrow}</p>
          <h1 className="mt-2 font-display text-[36px] italic leading-none tracking-normal text-ink">{title}</h1>
          <p className="mt-4 font-body text-sm leading-6 text-ink-muted">{description}</p>
          <p className="mt-3 font-body text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Updated {updatedAt}
          </p>
        </header>

        <div className="mt-5 space-y-3">
          {sections.map((section) => (
            <article key={section.title} className="rounded-[14px] border border-rule bg-paper px-4 py-4 shadow-[0_1px_0_#E5DAC5]">
              <h2 className="font-body text-sm font-bold text-ink">{section.title}</h2>
              <p className="mt-2 font-body text-[12.5px] leading-6 text-ink-muted">{section.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
