"use client";

import { ArchiveRestore, Mic, Search, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import { DashboardRecordCard } from "@/components/dashboard-record-card";
import {
  mergeDashboardRecords,
  type DashboardRecord,
  type LocalDashboardRecord
} from "@/lib/client/dashboard-data";
import {
  createIndexedDbLocalRecordingRepository,
  localRecordingMatchesScope,
  mapLocalRecordingsToDashboardRecords,
  mapQuarantinedLocalRecordings,
  recoverQuarantinedLocalRecordingForScope,
  type LocalRecordingScope,
  type LocalRecordingRepository,
  type QuarantinedLocalRecording
} from "@/lib/client/local-recordings";

interface DashboardScreenProps {
  doctorName?: string;
  clinicName?: string;
  records?: DashboardRecord[];
  localRepository?: LocalRecordingRepository;
  localRecordingScope?: LocalRecordingScope;
  pendingApprovalsCount?: number;
  pendingTranscriptionsCount?: number;
  demoMode?: boolean;
  onDeleteRecording?: (record: DashboardRecord) => Promise<void>;
}

function doctorInitial(name: string): string {
  return name.replace(/^Dr\.\s*/i, "").trim().charAt(0).toUpperCase() || "D";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function DashboardScreen({
  doctorName = "Doctor",
  clinicName = "Hospital",
  records = [],
  localRepository,
  localRecordingScope,
  pendingApprovalsCount = 0,
  pendingTranscriptionsCount,
  demoMode = false,
  onDeleteRecording
}: DashboardScreenProps) {
  const [localRecords, setLocalRecords] = useState<LocalDashboardRecord[]>([]);
  const [quarantinedRecords, setQuarantinedRecords] = useState<QuarantinedLocalRecording[]>([]);
  const [showRecovery, setShowRecovery] = useState(false);
  const repository = useMemo(
    () => localRepository ?? createIndexedDbLocalRecordingRepository(),
    [localRepository]
  );
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const visibleRecords = useMemo(
    () => mergeDashboardRecords(records, localRecords),
    [records, localRecords]
  );
  const pendingCount =
    pendingTranscriptionsCount ?? visibleRecords.filter((record) => record.status === "recorded").length;

  const loadLocalRecordings = useCallback(async (shouldUpdate: () => boolean = () => true) => {
    try {
      const localRecordings = await repository.list();
      const now = new Date();

      if (shouldUpdate()) {
        setLocalRecords(mapLocalRecordingsToDashboardRecords(localRecordings, now, localRecordingScope));
        setQuarantinedRecords(mapQuarantinedLocalRecordings(localRecordings, now, localRecordingScope));
      }
    } catch {
      if (shouldUpdate()) {
        setLocalRecords([]);
        setQuarantinedRecords([]);
      }
    }
  }, [localRecordingScope, repository]);

  useEffect(() => {
    if (!localRepository && typeof indexedDB === "undefined") {
      return;
    }

    let isMounted = true;

    void loadLocalRecordings(() => isMounted);

    return () => {
      isMounted = false;
    };
  }, [loadLocalRecordings, localRepository]);

  async function deleteLocalRecord(record: DashboardRecord): Promise<boolean> {
    const localRecording = (await repository.list()).find(
      (item) =>
        localRecordingScope &&
        localRecordingMatchesScope(item, localRecordingScope) &&
        (item.id === record.id || item.serverRecordingId === record.id)
    );

    if (!localRecording) {
      return false;
    }

    if (localRecording.serverRecordingId && onDeleteRecording) {
      await onDeleteRecording({ ...record, id: localRecording.serverRecordingId, offline: false });
    }

    await repository.remove(localRecording.id);
    setLocalRecords((currentRecords) => currentRecords.filter((currentRecord) => currentRecord.id !== record.id));
    return true;
  }

  async function recoverQuarantinedRecord(record: QuarantinedLocalRecording) {
    if (!localRecordingScope) {
      return;
    }

    await recoverQuarantinedLocalRecordingForScope(repository, record.id, localRecordingScope);
    await loadLocalRecordings();
  }

  async function deleteQuarantinedRecord(record: QuarantinedLocalRecording) {
    await repository.remove(record.id);
    await loadLocalRecordings();
  }

  async function confirmDelete(record: DashboardRecord) {
    setDeletingRecordId(record.id);
    setDeleteError(null);

    try {
      if (record.offline) {
        const didDeleteLocalRecord = await deleteLocalRecord(record);

        if (!didDeleteLocalRecord && onDeleteRecording) {
          await onDeleteRecording(record);
        }
      } else {
        if (!onDeleteRecording) {
          throw new Error("Delete is not available.");
        }

        await onDeleteRecording(record);
      }

      setConfirmingDeleteId(null);
    } catch {
      setDeleteError("Unable to delete consultation. Try again.");
    } finally {
      setDeletingRecordId(null);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
      <section className="paper-bg flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-3 px-5 pb-4 pt-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta font-display text-[22px] text-white">
            {doctorInitial(doctorName)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-body text-[15px] font-bold leading-tight text-ink">{doctorName}</h1>
            <p className="mt-1 flex items-center gap-1.5 font-body text-xs text-ink-muted">
              <span className="h-1 w-1 rounded-full bg-saffron" />
              {clinicName}
            </p>
          </div>
          <Link
            href="/settings"
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            aria-label="Open settings"
          >
            <Settings className="h-[18px] w-[18px]" />
            {pendingApprovalsCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-paper bg-terracotta text-[10px] font-bold text-white">
                {pendingApprovalsCount}
              </span>
            ) : null}
          </Link>
        </header>

        <div className="px-5 pb-4">
          <Link
            href="/search"
            className="flex w-full items-center gap-2.5 rounded-[14px] border border-rule bg-paper-deep px-3.5 py-3 text-left"
            aria-label="Search by Patient ID"
          >
            <Search className="h-[18px] w-[18px] text-ink-muted" />
            <span className="flex-1 font-body text-sm text-ink-faint">Search by Patient ID</span>
            <span className="rounded border border-rule bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
              all records
            </span>
          </Link>
        </div>

        <div className="px-5 pb-2">
          <h2 className="font-display text-[28px] italic leading-none tracking-normal text-ink">Consultations</h2>
          <p className="mt-1.5 font-body text-xs text-ink-muted">
            {pluralize(visibleRecords.length, "record")} · {pluralize(pendingCount, "pending transcription")}
          </p>
        </div>

        {quarantinedRecords.length > 0 ? (
          <section
            className="mx-4 mb-3 rounded-[14px] border border-ochre/40 bg-paper px-4 py-3"
            aria-label="Local recording recovery"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ochre/10 text-ochre">
                <ArchiveRestore className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-body text-sm font-bold text-ink">
                  {pluralize(quarantinedRecords.length, "hidden local recording")}
                </h3>
                <p className="mt-1 font-body text-xs leading-relaxed text-ink-muted">
                  Kept separate until you confirm ownership or delete safely.
                </p>
              </div>
            </div>
            <button
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-rule bg-paper-deep px-3 py-2 font-body text-xs font-bold text-terracotta transition active:scale-[0.99]"
              type="button"
              onClick={() => setShowRecovery((current) => !current)}
            >
              {showRecovery ? "Hide recovery" : "Review recovery"}
            </button>
            {showRecovery ? (
              <div className="mt-3 space-y-2">
                <p className="font-body text-[11px] leading-relaxed text-ink-muted">
                  Patient IDs stay hidden until you recover a recording to this account.
                </p>
                {quarantinedRecords.map((record) => (
                  <div key={record.id} className="rounded-lg border border-rule bg-paper-deep px-3 py-3">
                    <p className="font-body text-xs font-semibold text-ink">Older local recording</p>
                    <p className="mt-1 font-body text-[11px] text-ink-muted">
                      {record.time} · {record.duration}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <BharatButton
                        className="min-h-11 flex-1 px-3 py-2 text-xs"
                        variant="ghost"
                        onClick={() => void deleteQuarantinedRecord(record)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </BharatButton>
                      <BharatButton
                        className="min-h-11 flex-1 px-3 py-2 text-xs"
                        aria-label="Confirm ownership of hidden local recording"
                        onClick={() => void recoverQuarantinedRecord(record)}
                      >
                        Confirm ownership
                      </BharatButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-28">
          {visibleRecords.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ochre bg-paper px-4 py-8 text-center">
              <p className="font-body text-sm font-bold text-ink">No consultations yet</p>
              <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
                Start a recording to add the first consultation for this hospital.
              </p>
            </div>
          ) : (
            visibleRecords.map((record) => (
              <DashboardRecordCard
                key={record.id}
                record={record}
                demoMode={demoMode}
                deleteState={
                  deletingRecordId === record.id
                    ? "deleting"
                    : confirmingDeleteId === record.id
                      ? "confirming"
                      : "idle"
                }
                deleteError={confirmingDeleteId === record.id ? deleteError : null}
                onRequestDelete={(nextRecord) => {
                  setDeleteError(null);
                  setConfirmingDeleteId(nextRecord.id);
                }}
                onCancelDelete={() => {
                  setDeleteError(null);
                  setConfirmingDeleteId(null);
                }}
                onConfirmDelete={(nextRecord) => void confirmDelete(nextRecord)}
              />
            ))
          )}
        </div>

        <div className="pointer-events-none absolute bottom-[calc(var(--bottom-nav-height)+1rem)] left-0 right-0 flex justify-center">
          <Link
            className="pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-terracotta px-5 py-4 font-body text-base font-bold tracking-[0.01em] text-white shadow-warm transition active:scale-[0.99]"
            href="/recordings/new"
            role="button"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <Mic className="h-5 w-5" />
            </span>
            Start recording
          </Link>
        </div>

        <BottomNav active="home" />
      </section>
    </main>
  );
}
