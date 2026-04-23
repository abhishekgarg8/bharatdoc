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
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/wav";
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
      return {
        blob: new Blob(["demo audio"], { type: "audio/webm" }),
        mimeType: "audio/webm",
        durationSeconds: 12
      };
    },
    onChunk() {
      return () => undefined;
    }
  };
}
