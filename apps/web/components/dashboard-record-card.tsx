import { ChevronRight, Trash2, WifiOff } from "lucide-react";
import Link from "next/link";
import type { DashboardRecord } from "@/lib/client/dashboard-data";
import { StatusTick } from "@/components/status-tick";
import { BharatButton } from "@/components/bharat-button";

interface DashboardRecordCardProps {
  record: DashboardRecord;
  demoMode?: boolean;
  deleteState?: "idle" | "confirming" | "deleting";
  deleteError?: string | null;
  onRequestDelete?: (record: DashboardRecord) => void;
  onCancelDelete?: () => void;
  onConfirmDelete?: (record: DashboardRecord) => void;
}

export function DashboardRecordCard({
  record,
  demoMode = false,
  deleteState = "idle",
  deleteError,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete
}: DashboardRecordCardProps) {
  const canDelete = Boolean(onRequestDelete) && (record.offline || record.canEdit !== false);
  const isConfirmingDelete = deleteState === "confirming";
  const isDeleting = deleteState === "deleting";
  const content = (
    <>
      <div className="w-[72px] shrink-0 overflow-hidden rounded-md border border-dashed border-ochre bg-paper-deep px-2 py-1.5 text-center">
        <div className="font-body text-[9px] font-bold uppercase tracking-[0.12em] text-ochre">Patient</div>
        <div className="mt-0.5 truncate font-mono text-[13px] font-bold text-ink">{record.patientId}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 font-body text-[13px] font-bold text-ink">
          <span>{record.time}</span>
          {record.offline ? <WifiOff className="h-3 w-3 text-terracotta" aria-label="Stored offline" /> : null}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 font-body text-[11.5px] text-ink-muted">
          <span className="shrink-0">{record.duration}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
          <span className="truncate">{record.doctorName}</span>
        </div>
        <div className="mt-2">
          {record.offline ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-terracotta">
              {record.localCaptureState === "recording" || record.localCaptureState === "paused"
                ? "Interrupted recording"
                : record.localCaptureState === "failed"
                  ? "Transcription failed"
                  : record.localCaptureState === "transcribing"
                    ? "Transcription interrupted"
                    : record.localCaptureState === "transcribed"
                      ? "Transcript ready"
                      : "Awaiting transcription"}
            </span>
          ) : (
            <StatusTick status={record.status} />
          )}
        </div>
      </div>
    </>
  );

  const deleteButton = canDelete ? (
    <button
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-stamp transition active:scale-[0.98] disabled:opacity-60"
      type="button"
      aria-label={`Delete consultation ${record.patientId}`}
      disabled={isDeleting}
      onClick={() => onRequestDelete?.(record)}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  ) : null;

  const confirmation = isConfirmingDelete || isDeleting || deleteError ? (
    <div className="border-t border-rule px-4 py-3">
      <p className="font-body text-xs font-semibold text-ink">Delete this consultation and recording?</p>
      <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-muted">
        This removes the consultation, transcript, summary, PDF, and stored audio.
      </p>
      {deleteError ? <p className="mt-2 font-body text-[11px] font-semibold text-stamp">{deleteError}</p> : null}
      <div className="mt-3 flex gap-2">
        <BharatButton className="min-h-11 flex-1 px-3 py-2 text-xs" variant="ghost" disabled={isDeleting} onClick={onCancelDelete}>
          Cancel
        </BharatButton>
        <BharatButton
          className="min-h-11 flex-1 bg-stamp px-3 py-2 text-xs text-white"
          disabled={isDeleting}
          onClick={() => onConfirmDelete?.(record)}
        >
          {isDeleting ? "Deleting" : "Delete"}
        </BharatButton>
      </div>
    </div>
  ) : null;

  if (record.offline) {
    const action =
      record.localCaptureState === "recording" || record.localCaptureState === "paused"
        ? "Resume"
        : record.localCaptureState === "failed"
          ? "Retry"
          : record.localCaptureState === "transcribing"
            ? "Continue"
            : record.localCaptureState === "transcribed"
              ? "Open"
              : "Transcribe";
    const localRecordingId = record.localRecordingId ?? record.id;
    const href =
      record.localCaptureState === "transcribed" && record.id !== localRecordingId
        ? `/recordings/${record.id}`
        : `/recordings/new?local_recording_id=${encodeURIComponent(localRecordingId)}${demoMode ? "&demo=1" : ""}`;
    const localStatus =
      record.localCaptureState === "recording" || record.localCaptureState === "paused"
        ? "Interrupted recording"
        : record.localCaptureState === "failed"
          ? "Transcription failed"
          : record.localCaptureState === "transcribing"
            ? "Transcription interrupted"
            : record.localCaptureState === "transcribed"
              ? "Transcript ready"
              : "Awaiting transcription";

    return (
      <article
        className="overflow-hidden rounded-[14px] border border-rule bg-paper shadow-[0_1px_0_#E5DAC5]"
        aria-label={`Local recording ${record.patientId}: ${localStatus}`}
      >
        <div className="flex items-start gap-3 p-4">
          {content}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              className="inline-flex min-h-11 items-center rounded-full border border-rule bg-paper-deep px-3 py-1.5 font-body text-xs font-bold text-terracotta transition active:scale-[0.99]"
              href={href}
              aria-label={`${action} recording ${record.patientId}`}
            >
              {action}
            </Link>
            {deleteButton}
          </div>
        </div>
        {confirmation}
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-[14px] border border-rule bg-paper shadow-[0_1px_0_#E5DAC5]">
      <div className="flex items-center gap-2 p-4">
        <Link
          className="flex min-w-0 flex-1 items-center gap-3 transition active:scale-[0.99]"
          href={`/recordings/${record.id}`}
          aria-label={`Open recording ${record.patientId}`}
        >
          {content}
          <ChevronRight className="h-4.5 w-4.5 shrink-0 text-ink-faint" />
        </Link>
        {deleteButton}
      </div>
      {confirmation}
    </article>
  );
}
