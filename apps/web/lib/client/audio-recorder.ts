import { AUDIO_CHUNK_INTERVAL_SECONDS } from "@/lib/client/local-recordings";

export const DEFAULT_AUDIO_MIME_TYPE = "audio/webm";

export interface AudioRecorderController {
  pause(): void;
  resume(): void;
  stop(): Promise<Blob>;
  destroy(): void;
}

export type AudioRecorderFactory = () => Promise<AudioRecorderController>;

export interface RecordRTCInstance {
  startRecording(): void;
  pauseRecording(): void;
  resumeRecording(): void;
  stopRecording(callback?: () => void): void;
  getBlob(): Blob | null;
  destroy(): void;
}

export type RecordRTCFactory = (stream: MediaStream, options: Record<string, unknown>) => RecordRTCInstance;

export interface AudioRecorderDependencies {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  loadRecordRTC(): Promise<RecordRTCFactory>;
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

function supportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return DEFAULT_AUDIO_MIME_TYPE;
  }

  const candidates = ["audio/webm;codecs=opus", DEFAULT_AUDIO_MIME_TYPE, "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? DEFAULT_AUDIO_MIME_TYPE;
}

function combineChunks(chunks: Blob[], fallbackType: string): Blob {
  const firstChunk = chunks[0];
  return new Blob(chunks, { type: firstChunk?.type || fallbackType });
}

export function createRecordRtcAudioRecorderWithDependencies(
  dependencies: AudioRecorderDependencies
): AudioRecorderFactory {
  return async () => {
    const RecordRTC = await dependencies.loadRecordRTC();
    const stream = await dependencies.getUserMedia({ audio: true, video: false });
    const chunks: Blob[] = [];
    const mimeType = supportedAudioMimeType();
    let recorder: RecordRTCInstance;

    try {
      recorder = RecordRTC(stream, {
        type: "audio",
        mimeType,
        timeSlice: AUDIO_CHUNK_INTERVAL_SECONDS * 1000,
        numberOfAudioChannels: 1,
        disableLogs: true,
        ondataavailable(blob: Blob) {
          if (blob.size > 0) {
            chunks.push(blob);
          }
        }
      });
      recorder.startRecording();
    } catch (error) {
      stopStream(stream);
      throw error;
    }

    let stoppedBlob: Blob | null = null;
    let stopPromise: Promise<Blob> | null = null;

    return {
      pause() {
        recorder.pauseRecording();
      },

      resume() {
        recorder.resumeRecording();
      },

      stop() {
        if (stoppedBlob) {
          return Promise.resolve(stoppedBlob);
        }

        if (stopPromise) {
          return stopPromise;
        }

        stopPromise = new Promise<Blob>((resolve, reject) => {
          try {
            recorder.stopRecording(() => {
              try {
                const recordedBlob = recorder.getBlob();
                stoppedBlob =
                  recordedBlob && recordedBlob.size > 0
                    ? recordedBlob
                    : combineChunks(chunks, mimeType);
                stopStream(stream);
                resolve(stoppedBlob);
              } catch (error) {
                stopStream(stream);
                reject(error);
              }
            });
          } catch (error) {
            stopStream(stream);
            reject(error);
          }
        });

        return stopPromise;
      },

      destroy() {
        stopStream(stream);
        recorder.destroy();
      }
    };
  };
}

export const createRecordRtcAudioRecorder = createRecordRtcAudioRecorderWithDependencies({
  getUserMedia(constraints) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is not available in this browser.");
    }

    return navigator.mediaDevices.getUserMedia(constraints);
  },

  async loadRecordRTC() {
    const module = await import("recordrtc");
    return module.default;
  }
});

export const createMockAudioRecorder: AudioRecorderFactory = async () => {
  const blob = new Blob(["mock-audio"], { type: DEFAULT_AUDIO_MIME_TYPE });

  return {
    pause() {},
    resume() {},
    async stop() {
      return blob;
    },
    destroy() {}
  };
};
