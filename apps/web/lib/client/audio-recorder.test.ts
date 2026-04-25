import { describe, expect, it } from "vitest";
import { createDemoAudioRecorder, createDemoWavBlob } from "@/lib/client/audio-recorder";

async function headerText(blob: Blob, start: number, end: number): Promise<string> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob.slice(start, end));
  });

  return String.fromCharCode(...new Uint8Array(buffer));
}

describe("demo audio recorder", () => {
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
});
