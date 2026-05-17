"use client";

import { ArrowLeft, Download, FileCheck2, FileText, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { BharatButton } from "@/components/bharat-button";
import { StatusTick } from "@/components/status-tick";
import {
  demoGeneratedSummary,
  demoPdfSignedUrl,
  type RecordingDetailRecord
} from "@/lib/client/recording-detail-data";
import {
  generateRecordingPdf,
  saveRecordingSummary,
  summarizeRecording,
  type WorkerPdfResponse,
  type WorkerSummaryResponse
} from "@/lib/client/summary-api";
import type { WorkerTranscriptionResponse } from "@/lib/client/transcription-api";
import { cn } from "@/lib/utils";

interface TranscriptSummaryScreenProps {
  recording: RecordingDetailRecord;
  idToken?: string;
  fetcher?: typeof fetch;
  onGenerateTranscript?: (recordingId: string) => Promise<WorkerTranscriptionResponse>;
  onGenerateSummary?: (recordingId: string) => Promise<WorkerSummaryResponse>;
  onSaveSummary?: (recordingId: string, summary: string) => Promise<RecordingDetailRecord>;
  onGeneratePdf?: (recordingId: string) => Promise<WorkerPdfResponse>;
}

type ActiveTab = "transcript" | "summary";

function linesFor(text: string | null): string[] {
  return text?.trim().split(/\n{2,}/).filter(Boolean) ?? [];
}

export function TranscriptSummaryScreen({
  recording,
  idToken,
  fetcher = fetch,
  onGenerateTranscript,
  onGenerateSummary,
  onSaveSummary,
  onGeneratePdf
}: TranscriptSummaryScreenProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(recording.summary ? "summary" : "transcript");
  const [transcript, setTranscript] = useState(recording.transcript ?? "");
  const [summary, setSummary] = useState(recording.summary ?? "");
  const [status, setStatus] = useState(recording.status);
  const [savedSummary, setSavedSummary] = useState(recording.summary ?? "");
  const [pdfStoragePath, setPdfStoragePath] = useState(recording.pdfStoragePath);
  const [pdfUrl, setPdfUrl] = useState<string | null>(recording.pdfSignedUrl);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pdfPanelRef = useRef<HTMLDivElement>(null);
  const transcriptBlocks = useMemo(() => linesFor(transcript), [transcript]);
  const summaryBlocks = useMemo(() => linesFor(summary), [summary]);
  const hasTranscript = Boolean(transcript.trim());
  const canEditRecording = recording.canEdit;
  const canSave = summary.trim() !== savedSummary.trim();

  function guardEditable(): boolean {
    if (canEditRecording) {
      return true;
    }

    setMessage(null);
    setError("Only the recording doctor can edit this record.");
    return false;
  }

  async function generateTranscript() {
    if (!guardEditable()) {
      return;
    }

    setMessage(null);
    setError(null);
    setGenerating(true);

    try {
      if (!onGenerateTranscript) {
        throw new Error("Audio is not available.");
      }

      const result = await onGenerateTranscript(recording.id);

      setTranscript(result.transcript);
      setStatus(result.status);
      setActiveTab("transcript");
      setMessage("Transcript ready.");
    } catch {
      setError("Original audio is not available on this device. Open this recording on the device that captured it and try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function generateSummary() {
    if (!guardEditable()) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!hasTranscript) {
      setError("Transcript is required before summary generation.");
      return;
    }

    setGenerating(true);

    try {
      const result = onGenerateSummary
        ? await onGenerateSummary(recording.id)
        : idToken
          ? await summarizeRecording(idToken, recording.id, fetcher)
          : {
              recording_id: recording.id,
              summary: demoGeneratedSummary,
              status: "summary_ready" as const
            };

      setSummary(result.summary);
      setSavedSummary(result.summary);
      setStatus(result.status);
      setPdfStoragePath(null);
      setPdfUrl(null);
      setActiveTab("summary");
      setMessage("Summary generated.");
    } catch {
      setError("Unable to generate summary.");
    } finally {
      setGenerating(false);
    }
  }

  async function generatePrimary() {
    if (hasTranscript) {
      await generateSummary();
      return;
    }

    await generateTranscript();
  }

  async function saveSummary() {
    if (!guardEditable()) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!summary.trim()) {
      setError("Summary cannot be empty.");
      return;
    }

    setSaving(true);

    try {
      const updated = onSaveSummary
        ? await onSaveSummary(recording.id, summary)
        : idToken
          ? await saveRecordingSummary(idToken, recording.id, summary, fetcher)
          : {
              ...recording,
              summary,
              status: "summary_ready" as const,
              pdfStoragePath: null,
              pdfSignedUrl: null
            };

      setSummary(updated.summary ?? summary);
      setSavedSummary(updated.summary ?? summary);
      setStatus(updated.status);
      setPdfStoragePath(updated.pdfStoragePath ?? null);
      setPdfUrl(null);
      setMessage("Summary saved.");
    } catch {
      setError("Unable to save summary.");
    } finally {
      setSaving(false);
    }
  }

  async function generatePdf() {
    if (!guardEditable()) {
      return;
    }

    setMessage(null);
    setError(null);

    if (!summary.trim()) {
      setError("Summary is required before PDF generation.");
      return;
    }

    if (canSave) {
      setError("Save summary before PDF generation.");
      return;
    }

    setGeneratingPdf(true);

    try {
      const result = onGeneratePdf
        ? await onGeneratePdf(recording.id)
        : idToken
          ? await generateRecordingPdf(idToken, recording.id, fetcher)
          : {
              recording_id: recording.id,
              pdf_storage_path: `demo/${recording.id}.pdf`,
              signed_url: demoPdfSignedUrl,
              status: "pdf_saved" as const
            };

      setPdfStoragePath(result.pdf_storage_path);
      setPdfUrl(result.signed_url);
      setStatus(result.status);
      setMessage("PDF generated.");
      window.requestAnimationFrame(() => {
        if (typeof pdfPanelRef.current?.scrollIntoView === "function") {
          pdfPanelRef.current.scrollIntoView({ block: "end", behavior: "auto" });
        }
      });
    } catch {
      setError("Unable to generate PDF.");
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="flex items-start gap-3 px-5 pb-4 pt-5">
          <Link
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            href="/dashboard"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-body text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta">
              Consultation
            </p>
            <h1 className="mt-1 font-display text-[30px] italic leading-none tracking-normal text-ink">
              {recording.patientId}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-xs text-ink-muted">
              <span>{recording.time}</span>
              <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
              <span>{recording.duration}</span>
              <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
              <span>{recording.doctorName}</span>
              {!canEditRecording ? (
                <>
                  <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
                  <span>Read-only</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-1 shrink-0">
            <StatusTick status={status} />
          </div>
        </header>

        <div className="px-5 pb-3">
          <div className="grid grid-cols-2 rounded-xl border border-rule bg-paper-deep p-1">
            <button
              className={cn(
                "min-h-10 rounded-lg font-body text-sm font-bold transition",
                activeTab === "transcript" ? "bg-paper text-ink shadow-[0_1px_0_#E5DAC5]" : "text-ink-muted"
              )}
              type="button"
              onClick={() => setActiveTab("transcript")}
            >
              Transcript
            </button>
            <button
              className={cn(
                "min-h-10 rounded-lg font-body text-sm font-bold transition",
                activeTab === "summary" ? "bg-paper text-ink shadow-[0_1px_0_#E5DAC5]" : "text-ink-muted"
              )}
              type="button"
              onClick={() => setActiveTab("summary")}
            >
              Summary
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {activeTab === "transcript" ? (
            <section className="space-y-3">
              <div className="flex items-center gap-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta">
                <FileText className="h-4 w-4" />
                Transcript
              </div>
              {transcriptBlocks.length > 0 ? (
                transcriptBlocks.map((block, index) => (
                  <p
                    key={`${index}-${block.slice(0, 24)}`}
                    className="rounded-xl border border-rule bg-paper px-3.5 py-3 font-body text-[13px] leading-relaxed text-ink-soft"
                  >
                    {block}
                  </p>
                ))
              ) : (
                <p className="rounded-xl border border-rule bg-paper px-3.5 py-3 font-body text-sm text-ink-muted">
                  Transcript is not available yet.
                </p>
              )}
            </section>
          ) : (
            <section>
              <label
                className="mb-2 flex items-center gap-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-terracotta"
                htmlFor="recording-summary"
              >
                <Sparkles className="h-4 w-4" />
                Summary
              </label>
              <textarea
                id="recording-summary"
                className={cn(
                  "min-h-[340px] w-full resize-none rounded-xl border-2 border-terracotta bg-paper px-3.5 py-3 font-body text-[13px] leading-relaxed text-ink-soft outline-none focus:ring-2 focus:ring-terracotta/20",
                  !canEditRecording && "border-rule bg-paper-deep"
                )}
                placeholder="Generate a summary from the transcript."
                value={summary}
                readOnly={!canEditRecording}
                onChange={(event) => {
                  setSummary(event.target.value);
                  setMessage(null);
                  setError(null);
                }}
              />
              <div ref={pdfPanelRef} className="mt-4 rounded-xl border border-rule bg-paper p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileCheck2 className="h-4 w-4 shrink-0 text-terracotta" />
                    <div className="min-w-0">
                      <h2 className="font-body text-xs font-bold uppercase tracking-[0.14em] text-terracotta">
                        PDF
                      </h2>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
                        {pdfStoragePath ?? "Not generated"}
                      </p>
                    </div>
                  </div>
                  <BharatButton
                    className="min-h-10 shrink-0 px-3 py-2"
                    variant="ghost"
                    icon={<FileCheck2 className="h-4 w-4" />}
                    disabled={generatingPdf || !canEditRecording}
                    onClick={generatePdf}
                  >
                    {generatingPdf ? "Making" : "PDF"}
                  </BharatButton>
                </div>

                {pdfStoragePath ? (
                  <div className="mt-3 rounded-lg border border-rule bg-paper-deep px-3 py-3">
                    <div className="font-display text-xl italic leading-none text-ink">Clinical Summary</div>
                    <div className="mt-2 font-body text-xs text-ink-muted">
                      {recording.patientId} · {recording.doctorName}
                    </div>
                    <div className="mt-3 space-y-1 font-body text-[12px] leading-relaxed text-ink-soft">
                      {summaryBlocks.slice(0, 3).map((block, index) => (
                        <p key={`${index}-${block.slice(0, 18)}`}>{block}</p>
                      ))}
                    </div>
                    {pdfUrl ? (
                      <a
                        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 font-body text-xs font-bold text-paper"
                        href={pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="h-4 w-4" />
                        Open PDF
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </section>
          )}

          {message ? <p className="mt-3 font-body text-xs font-semibold text-sage">{message}</p> : null}
          {error ? <p className="mt-3 font-body text-xs font-semibold text-stamp">{error}</p> : null}
        </div>

        <footer className="flex shrink-0 gap-2 border-t border-rule bg-paper px-5 pb-4 pt-3">
          <BharatButton
            className="flex-1"
            variant="ghost"
            icon={<Sparkles className="h-4 w-4" />}
            disabled={generating || !canEditRecording}
            onClick={generatePrimary}
          >
            {generating ? "Generating" : "Generate"}
          </BharatButton>
          <BharatButton
            className="flex-1"
            icon={<Save className="h-4 w-4" />}
            disabled={!canEditRecording || !canSave || saving}
            onClick={saveSummary}
          >
            {saving ? "Saving" : "Save"}
          </BharatButton>
        </footer>
      </section>
    </main>
  );
}
