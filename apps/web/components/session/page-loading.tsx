"use client";

import { Loader2 } from "lucide-react";

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

export function PageError({ title = "Unable to load", message }: { title?: string; message: string }) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] items-center justify-center bg-paper px-8 text-center text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <div className="rounded-xl border border-rule bg-paper-deep px-5 py-6">
        <h1 className="font-body text-base font-bold text-ink">{title}</h1>
        <p className="mt-2 font-body text-sm leading-6 text-ink-muted">{message}</p>
      </div>
    </main>
  );
}
