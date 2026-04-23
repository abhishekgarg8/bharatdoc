export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  durationSeconds?: number;
}

export interface AudioRecorder {
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<RecordedAudio>;
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
  new (stream: MediaStream, options: { type: "audio"; mimeType: string; recorderType?: unknown }): RecordRtcInstance;
  StereoAudioRecorder?: unknown;
}

export async function createRecordRtcAudioRecorder(): Promise<AudioRecorder> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const module = await import("recordrtc");
  const RecordRTC = module.default as RecordRtcConstructor;
  const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/wav";
  const recorder = new RecordRTC(stream, {
    type: "audio",
    mimeType,
    recorderType: RecordRTC.StereoAudioRecorder
  });
  let startedAt = 0;

  return {
    async start() {
      startedAt = Date.now();
      recorder.startRecording();
    },
    async pause() {
      recorder.pauseRecording();
    },
    async resume() {
      recorder.resumeRecording();
    },
    async stop() {
      return new Promise<RecordedAudio>((resolve) => {
        recorder.stopRecording(() => {
          for (const track of stream.getTracks()) {
            track.stop();
          }

          const audio: RecordedAudio = {
            blob: recorder.getBlob(),
            mimeType
          };

          if (startedAt) {
            audio.durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
          }

          resolve(audio);
        });
      });
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
    }
  };
}
