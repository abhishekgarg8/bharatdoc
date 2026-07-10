"use client";

import { useMemo } from "react";
import { isExplicitDemoModeEnabled } from "@/lib/demo-mode";

function currentSearchParams(): URLSearchParams | null {
  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search);
}

export function useExplicitDemoMode(): boolean {
  return useMemo(() => {
    const params = currentSearchParams();
    const demo = params?.get("demo");
    return isExplicitDemoModeEnabled(demo ? { demo } : undefined);
  }, []);
}

export function useExplicitMockRecorder(): boolean {
  return useMemo(() => currentSearchParams()?.get("mockRecorder") === "1", []);
}

export function useExplicitLocalRecordingId(): string | undefined {
  return currentSearchParams()?.get("local_recording_id")?.trim() || undefined;
}
