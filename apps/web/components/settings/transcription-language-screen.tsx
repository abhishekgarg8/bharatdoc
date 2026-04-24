"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { TranscriptionLanguage } from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { updateDoctorPreferences } from "@/lib/client/settings-api";
import { cn } from "@/lib/utils";

interface LanguageOption {
  id: TranscriptionLanguage;
  name: string;
  description: string;
}

interface TranscriptionLanguageScreenProps {
  initialLanguage?: TranscriptionLanguage;
  idToken?: string;
  fetcher?: typeof fetch;
}

const languageOptions: LanguageOption[] = [
  { id: "auto", name: "Auto-detect", description: "Best for Hindi, English, and mixed consultations" },
  { id: "hi", name: "Hindi", description: "Use when most consultations are Hindi-first" },
  { id: "en", name: "English", description: "Use for English-only practices" },
  { id: "hien", name: "Hinglish", description: "Mixed Hindi and English conversations" }
];

export function TranscriptionLanguageScreen({
  initialLanguage = "auto",
  idToken,
  fetcher = fetch
}: TranscriptionLanguageScreenProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<TranscriptionLanguage>(initialLanguage);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveLanguage() {
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (!idToken) {
        throw new Error("Authentication is required.");
      }

      await updateDoctorPreferences(idToken, { transcription_lang: selectedLanguage }, fetcher);
      setMessage("Transcription language saved.");
    } catch {
      setError("Unable to save transcription language.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="flex items-start gap-3 px-5 pb-4 pt-5">
          <Link
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            href="/settings"
            aria-label="Back to settings"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">Transcription</p>
            <h1 className="mt-1 font-display text-[30px] italic leading-none tracking-normal text-ink">Language</h1>
            <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
              Used to guide transcription accuracy before clinical summaries are generated.
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-5">
          {languageOptions.map((option) => {
            const selected = option.id === selectedLanguage;

            return (
              <button
                key={option.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-[14px] border bg-paper px-4 py-3.5 text-left",
                  selected ? "border-2 border-terracotta" : "border-rule"
                )}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setSelectedLanguage(option.id);
                  setMessage(null);
                  setError(null);
                }}
              >
                <span
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2",
                    selected ? "border-terracotta bg-terracotta text-white" : "border-rule bg-transparent text-transparent"
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-sm font-bold text-ink">{option.name}</span>
                  <span className="mt-0.5 block font-body text-xs text-ink-muted">{option.description}</span>
                </span>
              </button>
            );
          })}

          {message ? <p className="px-1 font-body text-xs font-semibold text-sage">{message}</p> : null}
          {error ? <p className="px-1 font-body text-xs font-semibold text-stamp">{error}</p> : null}
        </div>

        <footer className="shrink-0 border-t border-rule bg-paper px-5 pb-4 pt-3">
          <BharatButton className="w-full" disabled={saving} onClick={saveLanguage}>
            Save language
          </BharatButton>
        </footer>
      </section>
    </main>
  );
}
