import { describe, expect, it } from "vitest";
import { MAX_RECORDING_SECONDS } from "@bharatdoc/shared";
import { formatElapsedTime, initialRecordingState, reduceRecordingState } from "@/lib/client/recording-state";

describe("recording state machine", () => {
  it("starts, ticks, pauses, resumes, and completes a recording", () => {
    const started = reduceRecordingState(initialRecordingState, {
      type: "start",
      now: "2026-04-23T10:00:00.000Z"
    });
    const ticked = reduceRecordingState(started, { type: "tick", seconds: 90 });
    const paused = reduceRecordingState(ticked, { type: "pause" });
    const resumed = reduceRecordingState(paused, { type: "resume" });
    const completed = reduceRecordingState(resumed, {
      type: "stop",
      now: "2026-04-23T10:01:30.000Z"
    });

    expect(completed).toEqual({
      phase: "complete",
      startedAt: "2026-04-23T10:00:00.000Z",
      completedAt: "2026-04-23T10:01:30.000Z",
      durationSeconds: 90
    });
  });

  it("ignores invalid transitions", () => {
    expect(reduceRecordingState(initialRecordingState, { type: "pause" })).toEqual(initialRecordingState);
  });

  it("caps tick duration at the Phase 1 limit", () => {
    const started = reduceRecordingState(initialRecordingState, {
      type: "start",
      now: "2026-04-23T10:00:00.000Z"
    });

    expect(reduceRecordingState(started, { type: "tick", seconds: MAX_RECORDING_SECONDS + 100 })).toMatchObject({
      durationSeconds: MAX_RECORDING_SECONDS
    });
  });

  it("formats elapsed time", () => {
    expect(formatElapsedTime(90)).toBe("01:30");
    expect(formatElapsedTime(3599)).toBe("59:59");
  });
});
