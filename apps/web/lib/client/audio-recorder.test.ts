import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
}> = [];

vi.mock("recordrtc", () => {
  class MockRecordRTC {
    static StereoAudioRecorder = {};
    startRecording = vi.fn();
    pauseRecording = vi.fn();
    resumeRecording = vi.fn();
    stopRecording = vi.fn((callback: () => void) => callback());
    getBlob = vi.fn(() => new Blob(["recorded-audio"], { type: "audio/wav" }));

    constructor() {
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
});
