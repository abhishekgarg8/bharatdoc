"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createIndexedDbLocalRecordingRepository,
  type LocalRecordingRepository,
  type LocalRecordingScope
} from "@/lib/client/local-recordings";

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function DeviceStorageControls({
  scope,
  repository
}: {
  scope: LocalRecordingScope;
  repository?: LocalRecordingRepository;
}) {
  const local = useMemo(() => repository ?? createIndexedDbLocalRecordingRepository(), [repository]);
  const [usage, setUsage] = useState<{ recordings: number; bytes: number } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [purging, setPurging] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setUsage(await local.getUsage(scope));
      setUnavailable(false);
    } catch {
      setUsage(null);
      setUnavailable(true);
    }
  }, [local, scope]);

  useEffect(() => void refresh(), [refresh]);

  async function purge() {
    if (!window.confirm("Remove all consultation recordings stored on this device? Server records are not affected.")) return;
    setPurging(true);
    try {
      await local.purge(scope);
      await refresh();
    } catch {
      setUsage(null);
      setUnavailable(true);
    } finally {
      setPurging(false);
    }
  }

  return (
    <section className="mb-5 rounded-[14px] border border-rule bg-paper px-4 py-4 shadow-[0_1px_0_#E5DAC5]">
      <h2 className="font-body text-sm font-bold text-ink">Device storage</h2>
      <p className="mt-1 font-body text-[11.5px] leading-relaxed text-ink-muted">
        Interrupted recordings stay only on this device. Audio is removed after verified transcription.
      </p>
      <p className="mt-3 font-body text-xs font-semibold text-ink-soft">
        {unavailable
          ? "Device storage is unavailable."
          : usage?.recordings
          ? `${usage.recordings} ${usage.recordings === 1 ? "recording" : "recordings"} · ${bytesLabel(usage.bytes)}`
          : "No local recordings on this device."}
      </p>
      <button
        className="mt-3 min-h-11 font-body text-xs font-bold text-stamp underline-offset-2 hover:underline disabled:opacity-50"
        type="button"
        disabled={!usage?.recordings || purging}
        onClick={() => void purge()}
      >
        {purging ? "Removing…" : "Remove recordings from this device"}
      </button>
    </section>
  );
}
