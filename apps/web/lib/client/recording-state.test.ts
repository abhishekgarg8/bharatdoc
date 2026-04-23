import { MAX_RECORDING_SECONDS } from "@bharatdoc/shared";
import { describe, expect, it } from "vitest";
import { formatElapsedTime, initialRecordingState, reduceRecordingState } from "@/lib/client/recording-state";

describe("recording state machine", () => {
  it("starts, ticks, pauses, resumes, and completes a recording", () => {
    const started = reduceRecordingState(initialRecordingState, {
      type: "start",
      now: "2026-04-23T10:00:00.000Z"
    });
    const ticked = reduceRecordingState(started, { type: "tick", seconds: 31 });
    const paused = reduceRecordingState(ticked, { type: "pause" });
    const resumed = reduceRecordingState(paused, { type: "resume" });
    const complete = reduceRecordingState(resumed, { type: "stop", now: "2026-04-23T10:01:00.000Z" });

    expect(ticked.durationSeconds).toBe(31);
    expect(paused.phase).toBe("paused");
    expect(resumed.phase).toBe("recording");
    expect(complete).toMatchObject({
      phase: "complete",
      startedAt: "2026-04-23T10:00:00.000Z",
      completedAt: "2026-04-23T10:01:00.000Z"
    });
  });

  it("caps ticks at the 60 minute limit", () => {
    const started = reduceRecordingState(initialRecordingState, {
      type: "start",
      now: "2026-04-23T10:00:00.000Z"
    });

    expect(reduceRecordingState(started, { type: "tick", seconds: MAX_RECORDING_SECONDS + 100 }).durationSeconds).toBe(
      MAX_RECORDING_SECONDS
    );
  });

  it("formats elapsed time for recording UI", () => {
    expect(formatElapsedTime(9)).toBe("00:09");
    expect(formatElapsedTime(61)).toBe("01:01");
    expect(formatElapsedTime(3600)).toBe("1:00:00");
  });

  it("discards back to the initial ready state", () => {
    const started = reduceRecordingState(initialRecordingState, {
      type: "start",
      now: "2026-04-23T10:00:00.000Z"
    });

    expect(reduceRecordingState(started, { type: "discard" })).toEqual(initialRecordingState);
  });
});
