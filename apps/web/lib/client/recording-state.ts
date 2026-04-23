import { MAX_RECORDING_SECONDS, assertRecordingDuration } from "@bharatdoc/shared";

export type RecordingPhase = "ready" | "recording" | "paused" | "complete";

export interface RecordingSessionState {
  phase: RecordingPhase;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number;
}

export type RecordingSessionEvent =
  | { type: "start"; now: string }
  | { type: "tick"; seconds: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop"; now: string }
  | { type: "discard" };

export const initialRecordingState: RecordingSessionState = {
  phase: "ready",
  startedAt: null,
  completedAt: null,
  durationSeconds: 0
};

export function formatElapsedTime(seconds: number): string {
  const safeSeconds = assertRecordingDuration(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${remainingSeconds}`;
  }

  return `${String(minutes).padStart(2, "0")}:${remainingSeconds}`;
}

export function reduceRecordingState(
  state: RecordingSessionState,
  event: RecordingSessionEvent
): RecordingSessionState {
  switch (event.type) {
    case "start":
      if (state.phase !== "ready") {
        return state;
      }

      return {
        phase: "recording",
        startedAt: event.now,
        completedAt: null,
        durationSeconds: 0
      };

    case "tick":
      if (state.phase !== "recording") {
        return state;
      }

      return {
        ...state,
        durationSeconds: assertRecordingDuration(Math.min(event.seconds, MAX_RECORDING_SECONDS))
      };

    case "pause":
      if (state.phase !== "recording") {
        return state;
      }

      return {
        ...state,
        phase: "paused"
      };

    case "resume":
      if (state.phase !== "paused") {
        return state;
      }

      return {
        ...state,
        phase: "recording"
      };

    case "stop":
      if (state.phase !== "recording" && state.phase !== "paused") {
        return state;
      }

      return {
        ...state,
        phase: "complete",
        completedAt: event.now
      };

    case "discard":
      return initialRecordingState;
  }
}
