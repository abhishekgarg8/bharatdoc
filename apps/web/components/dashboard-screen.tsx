import { Mic, Search, Settings } from "lucide-react";
import { BharatButton } from "@/components/bharat-button";
import { BottomNav } from "@/components/bottom-nav";
import { DashboardRecordCard } from "@/components/dashboard-record-card";
import { demoDashboardRecords, type DashboardRecord } from "@/lib/client/dashboard-data";

interface DashboardScreenProps {
  doctorName?: string;
  clinicName?: string;
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

export function DashboardScreen({
  doctorName = "Dr. Aparna Iyer",
  clinicName = "Sunrise Clinic, Pune",
  records = demoDashboardRecords,
  pendingApprovalsCount = 1,
  pendingTranscriptionsCount
}: DashboardScreenProps) {
  const pendingCount =
    pendingTranscriptionsCount ?? records.filter((record) => record.status === "recorded").length;

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
            {pluralize(records.length, "record")} · {pluralize(pendingCount, "pending transcription")}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-28">
          {records.map((record) => (
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
          >
            Start recording
          </BharatButton>
        </div>

        <BottomNav active="home" />
      </section>
    </main>
  );
}
