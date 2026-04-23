import { describe, expect, it, vi } from "vitest";
import { AUDIO_CHUNK_INTERVAL_SECONDS } from "@/lib/client/local-recordings";
import {
  createRecordRtcAudioRecorderWithDependencies,
  DEFAULT_AUDIO_MIME_TYPE,
  type RecordRTCFactory,
  type RecordRTCInstance
} from "@/lib/client/audio-recorder";

function createStream() {
  const stop = vi.fn();
  const stream = {
    getTracks: () => [{ stop }]
  } as unknown as MediaStream;

  return { stop, stream };
}

function createRecorder(blob: Blob | null = new Blob(["audio"], { type: DEFAULT_AUDIO_MIME_TYPE })) {
  const recorder: RecordRTCInstance = {
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn((callback) => callback?.()),
    getBlob: vi.fn(() => blob),
    destroy: vi.fn()
  };

  return recorder;
}

describe("audio recorder", () => {
  it("starts RecordRTC with microphone audio and 30 second chunks", async () => {
    const { stop, stream } = createStream();
    const recorder = createRecorder();
    const RecordRTC = vi.fn(() => recorder) as unknown as RecordRTCFactory;
    const factory = createRecordRtcAudioRecorderWithDependencies({
      getUserMedia: vi.fn(async () => stream),
      loadRecordRTC: vi.fn(async () => RecordRTC)
    });

    const controller = await factory();

    expect(RecordRTC).toHaveBeenCalledWith(
      stream,
      expect.objectContaining({
        type: "audio",
        mimeType: DEFAULT_AUDIO_MIME_TYPE,
        timeSlice: AUDIO_CHUNK_INTERVAL_SECONDS * 1000,
        numberOfAudioChannels: 1,
        disableLogs: true
      })
    );
    expect(recorder.startRecording).toHaveBeenCalled();

    controller.pause();
    controller.resume();
    const blob = await controller.stop();

    expect(recorder.pauseRecording).toHaveBeenCalled();
    expect(recorder.resumeRecording).toHaveBeenCalled();
    expect(recorder.stopRecording).toHaveBeenCalled();
    expect(blob.type).toBe(DEFAULT_AUDIO_MIME_TYPE);
    expect(stop).toHaveBeenCalled();
  });

  it("combines chunk blobs when RecordRTC has no final blob", async () => {
    const { stream } = createStream();
    const recorder = createRecorder(null);
    const RecordRTC = vi.fn((_stream, options) => {
      const onDataAvailable = options.ondataavailable as (blob: Blob) => void;
      onDataAvailable(new Blob(["chunk"], { type: "audio/webm" }));
      return recorder;
    }) as unknown as RecordRTCFactory;
    const factory = createRecordRtcAudioRecorderWithDependencies({
      getUserMedia: vi.fn(async () => stream),
      loadRecordRTC: vi.fn(async () => RecordRTC)
    });

    const controller = await factory();
    const blob = await controller.stop();

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe("audio/webm");
  });

  it("destroys the recorder and releases microphone tracks", async () => {
    const { stop, stream } = createStream();
    const recorder = createRecorder();
    const factory = createRecordRtcAudioRecorderWithDependencies({
      getUserMedia: vi.fn(async () => stream),
      loadRecordRTC: vi.fn(async () => vi.fn(() => recorder) as unknown as RecordRTCFactory)
    });

    const controller = await factory();
    controller.destroy();

    expect(stop).toHaveBeenCalled();
    expect(recorder.destroy).toHaveBeenCalled();
  });

  it("releases microphone tracks when RecordRTC fails to start", async () => {
    const { stop, stream } = createStream();
    const factory = createRecordRtcAudioRecorderWithDependencies({
      getUserMedia: vi.fn(async () => stream),
      loadRecordRTC: vi.fn(async () => {
        return (() => {
          throw new Error("start failed");
        }) as RecordRTCFactory;
      })
    });

    await expect(factory()).rejects.toThrow("start failed");
    expect(stop).toHaveBeenCalled();
  });
});
