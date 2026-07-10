import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_CHECKPOINT_INTERVAL_MS,
  createDemoAudioRecorder,
  createDemoWavBlob,
  createRecordRtcAudioRecorder,
  selectSupportedAudioMimeType
} from "@/lib/client/audio-recorder";

const recordRtcInstances: Array<{
  startRecording: ReturnType<typeof vi.fn>;
  pauseRecording: ReturnType<typeof vi.fn>;
  resumeRecording: ReturnType<typeof vi.fn>;
  stopRecording: ReturnType<typeof vi.fn>;
  getBlob: ReturnType<typeof vi.fn>;
  requestData: ReturnType<typeof vi.fn>;
  getInternalRecorder: ReturnType<typeof vi.fn>;
  options: { recorderType?: unknown; timeSlice?: number };
}> = [];

vi.mock("recordrtc", () => {
  class MockRecordRTC {
    static StereoAudioRecorder = {};
    startRecording = vi.fn();
    pauseRecording = vi.fn();
    resumeRecording = vi.fn();
    stopRecording = vi.fn((callback: () => void) => callback());
    getBlob = vi.fn(() => new Blob(["recorded-audio"], { type: "audio/wav" }));
    requestData = vi.fn();
    getInternalRecorder = vi.fn(() => ({ getInternalRecorder: () => ({ requestData: this.requestData, state: "recording" }) }));
    options: { recorderType?: unknown; timeSlice?: number };

    constructor(_stream: MediaStream, options: { recorderType?: unknown; timeSlice?: number }) {
      this.options = options;
      recordRtcInstances.push(this);
    }
  }

  return {
    default: MockRecordRTC
  };
});

async function headerText(blob: Blob, start: number, end: number): Promise<string> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob.slice(start, end));
  });

  return String.fromCharCode(...new Uint8Array(buffer));
}

afterEach(() => {
  recordRtcInstances.length = 0;
  vi.unstubAllGlobals();
});

describe("demo audio recorder", () => {
  it("prefers browser-supported mobile audio MIME types before WAV fallback", () => {
    expect(selectSupportedAudioMimeType((mimeType) => mimeType === "audio/mp4")).toBe("audio/mp4");
    expect(selectSupportedAudioMimeType((mimeType) => mimeType === "audio/aac")).toBe("audio/aac");
    expect(selectSupportedAudioMimeType(() => false)).toBe("audio/wav");
  });

  it("creates a valid WAV container instead of mislabeled text bytes", async () => {
    const blob = createDemoWavBlob(1);

    expect(blob.type).toBe("audio/wav");
    expect(await headerText(blob, 0, 4)).toBe("RIFF");
    expect(await headerText(blob, 8, 12)).toBe("WAVE");
  });

  it("returns WAV audio metadata from the mock recorder", async () => {
    const recorder = await createDemoAudioRecorder();

    const recordedAudio = await recorder.stop();

    expect(recordedAudio.mimeType).toBe("audio/wav");
    expect(recordedAudio.blob.type).toBe("audio/wav");
    expect(recordedAudio.blob.size).toBeGreaterThan(44);
  });

  it("uses the final RecordRTC blob MIME type when stopping", async () => {
    const stopTrack = vi.fn();

    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack }]
        }))
      }
    });
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === "audio/webm;codecs=opus")
    });

    const recorder = await createRecordRtcAudioRecorder();
    const recordedAudio = await recorder.stop();

    expect(recordedAudio.mimeType).toBe("audio/wav");
    expect(recordedAudio.blob.type).toBe("audio/wav");
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(recordRtcInstances).toHaveLength(1);
  });

  it("checkpoints native recorder data within the 30-second durability window", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) }
    });
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: vi.fn(() => true)
    });

    const recorder = await createRecordRtcAudioRecorder();
    recorder.checkpoint();

    expect(AUDIO_CHECKPOINT_INTERVAL_MS).toBeGreaterThanOrEqual(15_000);
    expect(AUDIO_CHECKPOINT_INTERVAL_MS).toBeLessThanOrEqual(30_000);
    expect(recordRtcInstances[0]?.options).toMatchObject({ timeSlice: AUDIO_CHECKPOINT_INTERVAL_MS });
    expect(recordRtcInstances[0]?.options.recorderType).toBeUndefined();
    expect(recordRtcInstances[0]?.requestData).toHaveBeenCalledOnce();
  });

  it("treats unsupported, paused, and inactive lifecycle checkpoints as best effort", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) }
    });
    vi.stubGlobal("MediaRecorder", { isTypeSupported: vi.fn(() => true) });
    const recorder = await createRecordRtcAudioRecorder();
    const instance = recordRtcInstances[0]!;

    for (const state of ["paused", "inactive"]) {
      instance.getInternalRecorder.mockReturnValue({
        getInternalRecorder: () => ({ requestData: instance.requestData, state })
      });
      expect(recorder.checkpoint()).toBe(false);
    }
    instance.getInternalRecorder.mockReturnValue({});
    expect(recorder.checkpoint()).toBe(false);
    expect(instance.requestData).not.toHaveBeenCalled();
  });
});
