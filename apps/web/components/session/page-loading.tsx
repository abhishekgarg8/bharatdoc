"use client";

import { ArrowLeft, Home, Loader2 } from "lucide-react";
import Link from "next/link";

export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] items-center justify-center bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <div className="text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-terracotta" />
        <p className="mt-4 font-body text-sm text-ink-muted">{label}</p>
      </div>
    </main>
  );
}

export function PageError({
  title = "Unable to load",
  message,
  homeHref = "/dashboard"
}: {
  title?: string;
  message: string;
  homeHref?: string;
}) {
  function goBack() {
    if (typeof window === "undefined") {
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign(homeHref);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-paper px-5 text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <header className="flex items-center gap-3 pb-4 pt-5">
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
          type="button"
          onClick={goBack}
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">Error</p>
          <h1 className="mt-1 font-display text-[30px] italic leading-none tracking-normal text-ink">{title}</h1>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center pb-28 text-center">
        <section className="w-full rounded-xl border border-rule bg-paper-deep px-5 py-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-rule bg-paper text-ink-soft">
            <Home className="h-5 w-5" />
          </div>
          <h2 className="mt-4 font-body text-base font-bold text-ink">{title}</h2>
          <p className="mt-2 font-body text-sm leading-6 text-ink-muted">{message}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rule bg-transparent px-3 py-3 font-body text-sm font-bold text-ink-soft transition active:scale-[0.99]"
              type="button"
              onClick={goBack}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta px-3 py-3 font-body text-sm font-bold text-white shadow-warm transition active:scale-[0.99]"
              href={homeHref}
            >
              <Home className="h-4 w-4" />
              Dashboard
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
