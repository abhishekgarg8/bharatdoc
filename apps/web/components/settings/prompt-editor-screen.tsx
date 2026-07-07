"use client";

import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DEFAULT_SUMMARY_PROMPT,
  MAX_CUSTOM_PROMPT_CHARS,
  TRANSCRIPT_PLACEHOLDER,
  renderSummaryPrompt,
  validateSummaryPrompt
} from "@bharatdoc/shared";
import { BharatButton } from "@/components/bharat-button";
import { updateDoctorPreferences } from "@/lib/client/settings-api";

interface PromptEditorScreenProps {
  initialPrompt?: string | null;
  idToken?: string;
  fetcher?: typeof fetch;
}

const sampleTranscript = "Patient reports fever for two days and mild cough. Doctor advised fluids and paracetamol.";

function validationMessage(reason: "missing_transcript_placeholder" | "too_long" | "empty"): string {
  if (reason === "empty") {
    return "Prompt cannot be empty.";
  }

  if (reason === "too_long") {
    return "Prompt must be 2,000 characters or less.";
  }

  return `Add ${TRANSCRIPT_PLACEHOLDER} where the transcript should be inserted.`;
}

export function PromptEditorScreen({
  initialPrompt = DEFAULT_SUMMARY_PROMPT,
  idToken,
  fetcher = fetch
}: PromptEditorScreenProps) {
  const [prompt, setPrompt] = useState(initialPrompt ?? DEFAULT_SUMMARY_PROMPT);
  const [showSample, setShowSample] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const validation = useMemo(() => validateSummaryPrompt(prompt), [prompt]);
  const samplePreview = useMemo(() => renderSummaryPrompt(prompt, sampleTranscript), [prompt]);

  async function savePrompt() {
    setMessage(null);
    setError(null);

    if (!validation.ok) {
      setError(validationMessage(validation.reason));
      return;
    }

    setSaving(true);

    try {
      if (!idToken) {
        throw new Error("Authentication is required.");
      }

      await updateDoctorPreferences(
        idToken,
        { custom_prompt: validation.prompt === DEFAULT_SUMMARY_PROMPT ? null : validation.prompt },
        fetcher
      );
      setMessage("Summary prompt saved.");
    } catch {
      setError("Unable to save summary prompt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="flex items-start gap-3 px-5 pb-4 pt-5">
          <Link
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            href="/settings"
            aria-label="Back to settings"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">AI summary</p>
            <h1 className="mt-1 font-display text-[30px] italic leading-none tracking-normal text-ink">Summary prompt</h1>
            <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
              Customize the instruction used when generating clinical summaries.
            </p>
          </div>
          <button
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            type="button"
            aria-label="Reset prompt"
            onClick={() => {
              setPrompt(DEFAULT_SUMMARY_PROMPT);
              setShowSample(false);
              setError(null);
              setMessage("Default prompt restored. Save to keep this setting.");
            }}
          >
            <RotateCcw className="h-4.5 w-4.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="mb-4 rounded-[10px] border border-saffron/30 bg-saffron/10 px-3 py-2.5 font-body text-[11.5px] leading-relaxed text-ink-soft">
            Must contain <span className="rounded bg-paper-deep px-1.5 py-0.5 font-mono font-semibold text-ink">{TRANSCRIPT_PLACEHOLDER}</span>{" "}
            where the conversation should be inserted.
          </div>

          <label className="mb-2 block font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta" htmlFor="summary-prompt">
            Prompt
          </label>
          <textarea
            id="summary-prompt"
            className="min-h-[300px] w-full resize-none rounded-xl border-2 border-terracotta bg-paper px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink-soft outline-none focus:ring-2 focus:ring-terracotta/20"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setMessage(null);
              setError(null);
            }}
          />

          <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
            {validation.ok ? (
              <span className="font-semibold text-sage">Valid</span>
            ) : (
              <span className="font-semibold text-stamp">{validationMessage(validation.reason)}</span>
            )}
            <span className={prompt.length > MAX_CUSTOM_PROMPT_CHARS ? "text-stamp" : "text-ink-muted"}>
              {prompt.length} / {MAX_CUSTOM_PROMPT_CHARS} chars
            </span>
          </div>

          {showSample ? (
            <section className="mt-4 rounded-xl border border-rule bg-paper p-3">
              <h2 className="font-body text-xs font-bold uppercase tracking-[0.14em] text-terracotta">Sample render</h2>
              <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-ink-soft">
                {samplePreview}
              </pre>
            </section>
          ) : null}

          {message ? <p className="mt-3 font-body text-xs font-semibold text-sage">{message}</p> : null}
          {error ? <p className="mt-3 font-body text-xs font-semibold text-stamp">{error}</p> : null}
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-rule bg-paper px-5 pb-4 pt-3">
          <BharatButton
            className="flex-1"
            variant="ghost"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={() => setShowSample((current) => !current)}
          >
            Test sample
          </BharatButton>
          <BharatButton className="flex-1" disabled={!validation.ok || saving} onClick={savePrompt}>
            Save prompt
          </BharatButton>
        </footer>
      </section>
    </main>
  );
}
