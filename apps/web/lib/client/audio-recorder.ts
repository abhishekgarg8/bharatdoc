export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationSeconds?: number;
}

export interface RecordedAudioChunk {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

export interface AudioRecorder {
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<RecordedAudio>;
  onChunk(listener: (chunk: RecordedAudioChunk) => void | Promise<void>): () => void;
}

export type AudioRecorderFactory = () => Promise<AudioRecorder>;

interface RecordRtcInstance {
  startRecording(): void;
  pauseRecording(): void;
  resumeRecording(): void;
  stopRecording(callback: () => void): void;
  getBlob(): Blob;
}

interface RecordRtcConstructor {
  new (
    stream: MediaStream,
    options: {
      type: "audio";
      mimeType: string;
      recorderType?: unknown;
      timeSlice?: number;
      ondataavailable?: (blob: Blob) => void;
    }
  ): RecordRtcInstance;
  StereoAudioRecorder?: unknown;
}

const CHUNK_INTERVAL_MS = 30_000;
const DEMO_AUDIO_DURATION_SECONDS = 12;
const DEMO_AUDIO_SAMPLE_RATE = 16_000;
const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/wav"
];

export function selectSupportedAudioMimeType(
  isTypeSupported: (mimeType: string) => boolean = (mimeType) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)
): string {
  return RECORDING_MIME_CANDIDATES.find((mimeType) => isTypeSupported(mimeType)) ?? "audio/wav";
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function createDemoWavBlob(durationSeconds = DEMO_AUDIO_DURATION_SECONDS): Blob {
  const channelCount = 1;
  const bytesPerSample = 2;
  const sampleCount = Math.max(1, Math.round(durationSeconds * DEMO_AUDIO_SAMPLE_RATE));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, DEMO_AUDIO_SAMPLE_RATE, true);
  view.setUint32(28, DEMO_AUDIO_SAMPLE_RATE * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const tone = Math.sin((2 * Math.PI * 440 * sampleIndex) / DEMO_AUDIO_SAMPLE_RATE);
    view.setInt16(44 + sampleIndex * bytesPerSample, Math.round(tone * 1200), true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function createElapsedClock() {
  let startedAt = 0;
  let pausedAt = 0;
  let pausedMs = 0;

  return {
    start() {
      startedAt = Date.now();
      pausedAt = 0;
      pausedMs = 0;
    },
    pause() {
      if (!pausedAt) {
        pausedAt = Date.now();
      }
    },
    resume() {
      if (pausedAt) {
        pausedMs += Date.now() - pausedAt;
        pausedAt = 0;
      }
    },
    elapsedSeconds() {
      if (!startedAt) {
        return 0;
      }

      const pendingPauseMs = pausedAt ? Date.now() - pausedAt : 0;
      return Math.max(0, Math.round((Date.now() - startedAt - pausedMs - pendingPauseMs) / 1000));
    }
  };
}

export async function createRecordRtcAudioRecorder(): Promise<AudioRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const module = await import("recordrtc");
  const RecordRTC = module.default as RecordRtcConstructor;
  const mimeType = selectSupportedAudioMimeType();
  const listeners = new Set<(chunk: RecordedAudioChunk) => void | Promise<void>>();
  const clock = createElapsedClock();
  const recorder = new RecordRTC(stream, {
    type: "audio",
    mimeType,
    recorderType: RecordRTC.StereoAudioRecorder,
    timeSlice: CHUNK_INTERVAL_MS,
    ondataavailable(blob: Blob) {
      if (!blob || blob.size === 0) {
        return;
      }

      const chunk: RecordedAudioChunk = {
        blob,
        mimeType,
        durationSeconds: clock.elapsedSeconds()
      };

      for (const listener of listeners) {
        void listener(chunk);
      }
    }
  });

  return {
    async start() {
      clock.start();
      recorder.startRecording();
    },
    async pause() {
      clock.pause();
      recorder.pauseRecording();
    },
    async resume() {
      clock.resume();
      recorder.resumeRecording();
    },
    async stop() {
      clock.resume();

      return new Promise<RecordedAudio>((resolve) => {
        recorder.stopRecording(() => {
          for (const track of stream.getTracks()) {
            track.stop();
          }

          resolve({
            blob: recorder.getBlob(),
            mimeType,
            durationSeconds: clock.elapsedSeconds()
          });
        });
      });
    },
    onChunk(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    }
  };
}

export async function createDemoAudioRecorder(): Promise<AudioRecorder> {
  return {
    async start() {
      return undefined;
    },
    async pause() {
      return undefined;
    },
    async resume() {
      return undefined;
    },
    async stop() {
      const blob = createDemoWavBlob(DEMO_AUDIO_DURATION_SECONDS);

      return {
        blob,
        mimeType: blob.type,
        durationSeconds: DEMO_AUDIO_DURATION_SECONDS
      };
    },
    onChunk() {
      return () => undefined;
    }
  };
}
