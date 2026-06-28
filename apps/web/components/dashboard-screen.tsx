"use client";

import { Mic, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { DashboardRecordCard } from "@/components/dashboard-record-card";
import {
  mergeDashboardRecords,
  type DashboardRecord,
  type LocalDashboardRecord
} from "@/lib/client/dashboard-data";
import {
  createIndexedDbLocalRecordingRepository,
  mapLocalRecordingsToDashboardRecords,
  type LocalRecordingScope,
  type LocalRecordingRepository
} from "@/lib/client/local-recordings";

interface DashboardScreenProps {
  doctorName?: string;
  clinicName?: string;
  records?: DashboardRecord[];
  localRepository?: LocalRecordingRepository;
  localRecordingScope?: LocalRecordingScope;
  pendingApprovalsCount?: number;
  pendingTranscriptionsCount?: number;
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
  pendingTranscriptionsCount
}: DashboardScreenProps) {
  const [localRecords, setLocalRecords] = useState<LocalDashboardRecord[]>([]);
  const visibleRecords = useMemo(
    () => mergeDashboardRecords(records, localRecords),
    [records, localRecords]
  );
  const pendingCount =
    pendingTranscriptionsCount ?? visibleRecords.filter((record) => record.status === "recorded").length;

  useEffect(() => {
    if (!localRepository && typeof indexedDB === "undefined") {
      return;
    }

    const repository = localRepository ?? createIndexedDbLocalRecordingRepository();
    let isMounted = true;

    async function loadLocalRecordings() {
      try {
        const nextRecords = mapLocalRecordingsToDashboardRecords(await repository.list(), new Date(), localRecordingScope);

        if (isMounted) {
          setLocalRecords(nextRecords);
        }
      } catch {
        if (isMounted) {
          setLocalRecords([]);
        }
      }
    }

    void loadLocalRecordings();

    return () => {
      isMounted = false;
    };
  }, [localRepository, localRecordingScope]);

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
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
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
              hospital
            </span>
          </Link>
        </div>

        <div className="px-5 pb-2">
          <h2 className="font-display text-[28px] italic leading-none tracking-normal text-ink">Consultations</h2>
          <p className="mt-1.5 font-body text-xs text-ink-muted">
            {pluralize(visibleRecords.length, "record")} · {pluralize(pendingCount, "pending transcription")}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-28">
          {visibleRecords.length === 0 ? (
            <div className="rounded-xl border border-dashed border-ochre bg-paper px-4 py-8 text-center">
              <p className="font-body text-sm font-bold text-ink">No consultations yet</p>
              <p className="mt-2 font-body text-xs leading-relaxed text-ink-muted">
                Start a recording to add the first consultation for this hospital.
              </p>
            </div>
          ) : (
            visibleRecords.map((record) => <DashboardRecordCard key={record.id} record={record} />)
          )}
        </div>

        <div className="pointer-events-none absolute bottom-[88px] left-0 right-0 flex justify-center">
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
