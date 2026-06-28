import { ChevronRight, WifiOff } from "lucide-react";
import Link from "next/link";
import type { DashboardRecord } from "@/lib/client/dashboard-data";
import { StatusTick } from "@/components/status-tick";

interface DashboardRecordCardProps {
  record: DashboardRecord;
}

export function DashboardRecordCard({ record }: DashboardRecordCardProps) {
  const content = (
    <>
      <div className="min-w-[68px] shrink-0 rounded-md border border-dashed border-ochre bg-paper-deep px-2 py-1.5 text-center">
        <div className="font-body text-[9px] font-bold uppercase tracking-[0.12em] text-ochre">Patient</div>
        <div className="mt-0.5 font-mono text-[13px] font-bold text-ink">{record.patientId}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-body text-[13px] font-bold text-ink">
          <span>{record.time}</span>
          {record.offline ? <WifiOff className="h-3 w-3 text-terracotta" aria-label="Stored offline" /> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-body text-[11.5px] text-ink-muted">
          <span>{record.duration}</span>
          <span className="h-0.5 w-0.5 rounded-full bg-ink-faint" />
          <span>{record.doctorName}</span>
        </div>
        <div className="mt-2">
          {record.offline ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-terracotta">
              Awaiting transcription
            </span>
          ) : (
            <StatusTick status={record.status} />
          )}
        </div>
      </div>
    </>
  );

  if (record.offline) {
    return (
      <article
        className="flex items-center gap-3 rounded-[14px] border border-rule bg-paper p-4 shadow-[0_1px_0_#E5DAC5]"
        aria-label={`Local recording ${record.patientId} awaiting transcription`}
      >
        {content}
        <Link
          className="shrink-0 rounded-full border border-rule bg-paper-deep px-3 py-1.5 font-body text-xs font-bold text-terracotta transition active:scale-[0.99]"
          href="/recordings/new"
          aria-label={`Resume recording ${record.patientId}`}
        >
          Resume
        </Link>
      </article>
    );
  }

  return (
    <Link
      className="flex items-center gap-3 rounded-[14px] border border-rule bg-paper p-4 shadow-[0_1px_0_#E5DAC5] transition active:scale-[0.99]"
      href={`/recordings/${record.id}`}
      aria-label={`Open recording ${record.patientId}`}
    >
      {content}
      <ChevronRight className="h-4.5 w-4.5 shrink-0 text-ink-faint" />
    </Link>
  );
}
