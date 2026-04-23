"use client";

import { Mic, Search, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import { DashboardRecordCard } from "@/components/dashboard-record-card";
import {
  demoDashboardRecords,
  mapLocalRecordingToDashboardRecord,
  mergeDashboardRecords,
  type DashboardRecord,
  type LocalDashboardRecord
} from "@/lib/client/dashboard-data";
import { createLocalRecordingsRepository, type LocalRecordingsRepository } from "@/lib/client/local-recordings";

interface DashboardScreenProps {
  doctorName?: string;
  clinicName?: string;
  localRecordingsRepository?: Pick<LocalRecordingsRepository, "list">;
  now?: () => Date;
  records?: DashboardRecord[];
  pendingApprovalsCount?: number;
  pendingTranscriptionsCount?: number;
}

function doctorInitial(name: string): string {
  return name.replace(/^Dr\.\s*/i, "").trim().charAt(0).toUpperCase() || "D";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function defaultNow(): Date {
  return new Date();
}

export function DashboardScreen({
  doctorName = "Dr. Aparna Iyer",
  clinicName = "Sunrise Clinic, Pune",
  localRecordingsRepository,
  now,
  records = demoDashboardRecords,
  pendingApprovalsCount = 1,
  pendingTranscriptionsCount
}: DashboardScreenProps) {
  const [localRecords, setLocalRecords] = useState<LocalDashboardRecord[]>([]);
  const defaultLocalRecordingsRepository = useMemo(() => createLocalRecordingsRepository(), []);
  const effectiveLocalRecordingsRepository = localRecordingsRepository ?? defaultLocalRecordingsRepository;
  const effectiveNow = now ?? defaultNow;
  const dashboardRecords = useMemo(
    () => mergeDashboardRecords(records, localRecords),
    [localRecords, records]
  );
  const localPendingCount = localRecords.filter((record) => record.status === "recorded").length;
  const pendingCount =
    pendingTranscriptionsCount ?? dashboardRecords.filter((record) => record.status === "recorded").length;

  useEffect(() => {
    let mounted = true;
    const snapshotNow = effectiveNow();

    async function loadLocalRecordings() {
      try {
        const localMetadata = await effectiveLocalRecordingsRepository.list();

        if (mounted) {
          setLocalRecords(
            localMetadata.map((recording) => mapLocalRecordingToDashboardRecord(recording, snapshotNow))
          );
        }
      } catch {
        // The dashboard can still render server/demo records if IndexedDB is unavailable.
      }
    }

    void loadLocalRecordings();

    return () => {
      mounted = false;
    };
  }, [effectiveLocalRecordingsRepository, effectiveNow]);

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-paper text-ink shadow-[0_30px_80px_rgba(55,35,15,0.18)]">
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
          <button
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-deep text-ink-soft"
            type="button"
            aria-label="Open settings"
          >
            <Settings className="h-[18px] w-[18px]" />
            {pendingApprovalsCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-paper bg-terracotta text-[10px] font-bold text-white">
                {pendingApprovalsCount}
              </span>
            ) : null}
          </button>
        </header>

        <div className="px-5 pb-4">
          <button
            className="flex w-full items-center gap-2.5 rounded-[14px] border border-rule bg-paper-deep px-3.5 py-3 text-left"
            type="button"
          >
            <Search className="h-[18px] w-[18px] text-ink-muted" />
            <span className="flex-1 font-body text-sm text-ink-faint">Search by Patient ID</span>
            <span className="rounded border border-rule bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
              clinic
            </span>
          </button>
        </div>

        <div className="px-5 pb-2">
          <h2 className="font-display text-[28px] italic leading-none tracking-normal text-ink">Today's consultations</h2>
          <p className="mt-1.5 font-body text-xs text-ink-muted">
            {pluralize(dashboardRecords.length, "record")} · {pluralize(pendingCount, "pending transcription")}
          </p>
        </div>

        {localPendingCount > 0 ? (
          <div className="px-5 pb-3">
            <div className="rounded-xl border border-terracotta/25 bg-terracotta/10 px-3.5 py-2.5">
              <p className="font-body text-xs font-semibold text-terracotta">
                {pluralize(localPendingCount, "recording")} saved locally · transcribe when connected
              </p>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-28">
          {dashboardRecords.map((record) => (
            <DashboardRecordCard key={record.id} record={record} />
          ))}
        </div>

        <div className="pointer-events-none absolute bottom-[88px] left-0 right-0 flex justify-center">
          <BharatButton
            className="pointer-events-auto rounded-full px-5 py-4 text-base"
            icon={
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <Mic className="h-5 w-5" />
              </span>
            }
            asChild
          >
            <Link href="/recording">Start recording</Link>
          </BharatButton>
        </div>

        <BottomNav active="home" />
      </section>
    </main>
  );
}
