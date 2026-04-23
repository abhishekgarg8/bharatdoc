import { Check } from "lucide-react";
import type { RecordingStatus } from "@bharatdoc/shared";
import { cn } from "@/lib/utils";

const statusConfig: Record<
  RecordingStatus,
  {
    label: string;
    className: string;
    ticks: 1 | 2;
  }
> = {
  recorded: {
    label: "Recorded",
    className: "text-ink-faint",
    ticks: 1
  },
  transcribed: {
    label: "Transcribed",
    className: "text-indigo",
    ticks: 2
  },
  summary_ready: {
    label: "Summary ready",
    className: "text-saffron",
    ticks: 2
  },
  pdf_saved: {
    label: "PDF saved",
    className: "text-sage",
    ticks: 2
  }
};

interface StatusTickProps {
  status: RecordingStatus;
  className?: string;
}

export function StatusTick({ status, className }: StatusTickProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", config.className, className)}
      aria-label={config.label}
    >
      <span className="relative inline-flex h-3.5 w-5 items-center" aria-hidden="true">
        <Check className="absolute left-0 h-3.5 w-3.5 stroke-[3]" />
        {config.ticks === 2 ? <Check className="absolute left-1.5 h-3.5 w-3.5 stroke-[3]" /> : null}
      </span>
      {config.label}
    </span>
  );
}
