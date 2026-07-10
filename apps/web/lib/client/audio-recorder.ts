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
  checkpoint(): boolean;
  stop(): Promise<RecordedAudio>;
  dispose(): Promise<void>;
  onChunk(listener: (chunk: RecordedAudioChunk) => void | Promise<void>): () => void;
}

export type AudioRecorderFactory = () => Promise<AudioRecorder>;

interface RecordRtcInstance {
  startRecording(): void;
  pauseRecording(): void;
  resumeRecording(): void;
  stopRecording(callback: () => void): void;
  getBlob(): Blob;
  getInternalRecorder?(): unknown;
}

interface RecordRtcConstructor {
  new (
    stream: MediaStream,
    options: {
      type: "audio";
      mimeType: string;
      timeSlice?: number;
      ondataavailable?: (blob: Blob) => void;
    }
  ): RecordRtcInstance;
}

export const AUDIO_CHECKPOINT_INTERVAL_MS = 20_000;
const DEMO_AUDIO_DURATION_SECONDS = 12;
const DEMO_AUDIO_SAMPLE_RATE = 16_000;
const RECORDING_STOP_TIMEOUT_MS = 15_000;
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
  let tracksStopped = false;
  const stopTracks = () => {
    if (tracksStopped) return;
    tracksStopped = true;
    let tracks: MediaStreamTrack[] = [];
    try { tracks = stream.getTracks(); } catch { return; }
    for (const track of tracks) {
      try { track.stop(); } catch { /* Continue releasing remaining tracks. */ }
    }
  };
  let recorder: RecordRtcInstance;
  const listeners = new Set<(chunk: RecordedAudioChunk) => void | Promise<void>>();
  const clock = createElapsedClock();
  let pendingChunks: Promise<void> = Promise.resolve();
  let chunkError: unknown;
  const mimeType = selectSupportedAudioMimeType();

  try {
    const module = await import("recordrtc");
    const RecordRTC = module.default as RecordRtcConstructor;
    recorder = new RecordRTC(stream, {
      type: "audio",
      mimeType,
      timeSlice: AUDIO_CHECKPOINT_INTERVAL_MS,
      ondataavailable(blob: Blob) {
        if (!blob?.size || chunkError) return;
        const chunk: RecordedAudioChunk = {
          blob,
          mimeType: blob.type || mimeType,
          durationSeconds: clock.elapsedSeconds()
        };
        pendingChunks = pendingChunks
          .then(async () => { await Promise.all([...listeners].map((listener) => listener(chunk))); })
          .catch((caught) => { chunkError ??= caught; });
      }
    });
  } catch (caught) {
    stopTracks();
    throw caught;
  }

  let started = false;
  let disposed = false;
  let stopRequested = false;
  let rejectPendingStop: ((reason: Error) => void) | null = null;
  let stopPromise: Promise<RecordedAudio> | null = null;

  function detachListeners() {
    listeners.clear();
    try {
      const wrapper = recorder.getInternalRecorder?.() as { getInternalRecorder?(): unknown } | undefined;
      const nativeRecorder = wrapper?.getInternalRecorder?.() as {
        ondataavailable?: ((event: BlobEvent) => void) | null;
        onerror?: ((event: Event) => void) | null;
        onstop?: ((event: Event) => void) | null;
      } | undefined;
      if (nativeRecorder) {
        nativeRecorder.ondataavailable = null;
        nativeRecorder.onerror = null;
        nativeRecorder.onstop = null;
      }
    } catch { /* Cleanup must never block track release. */ }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    try {
      detachListeners();
      rejectPendingStop?.(new Error("Recorder was disposed before stop completed."));
      if (started && !stopRequested) {
        stopRequested = true;
        try { recorder.stopRecording(() => undefined); } catch { /* Track shutdown is authoritative. */ }
      }
    } finally {
      stopTracks();
    }
  }

  return {
    async start() {
      if (disposed) throw new Error("Recorder has been disposed.");
      try {
        clock.start();
        recorder.startRecording();
        started = true;
      } catch (caught) {
        await dispose();
        throw caught;
      }
    },
    async pause() {
      if (disposed) throw new Error("Recorder has been disposed.");
      clock.pause();
      recorder.pauseRecording();
    },
    async resume() {
      if (disposed) throw new Error("Recorder has been disposed.");
      clock.resume();
      recorder.resumeRecording();
    },
    checkpoint() {
      if (disposed) return false;
      try {
        // RecordRTC's WAV fallback has no requestData; its 20-second timeSlice is the durability bound.
        const wrapper = recorder.getInternalRecorder?.() as { getInternalRecorder?(): unknown } | undefined;
        const nativeRecorder = wrapper?.getInternalRecorder?.() as { requestData?(): void; state?: string } | undefined;
        if (!nativeRecorder?.requestData || (nativeRecorder.state && nativeRecorder.state !== "recording")) return false;
        nativeRecorder.requestData();
        return true;
      } catch {
        return false;
      }
    },
    async stop() {
      if (stopPromise) return stopPromise;
      if (disposed) throw new Error("Recorder has been disposed.");
      clock.resume();
      stopRequested = true;
      stopPromise = new Promise<RecordedAudio>((resolve, reject) => {
        let settled = false;
        let stopCallbackReceived = false;
        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback();
        };
        const fail = (reason: unknown) => settle(() => reject(reason));
        rejectPendingStop = fail;
        const complete = async () => {
          if (stopCallbackReceived || settled) return;
          stopCallbackReceived = true;
          try {
            await pendingChunks;
            if (settled) return;
            if (chunkError) throw chunkError;
            const blob = recorder.getBlob();
            settle(() => resolve({
              blob,
              mimeType: blob.type || "audio/wav",
              durationSeconds: clock.elapsedSeconds()
            }));
          } catch (caught) {
            fail(caught);
          }
        };
        const timeout = setTimeout(
          () => fail(new Error("Recorder stop timed out.")),
          RECORDING_STOP_TIMEOUT_MS
        );
        try { recorder.stopRecording(() => { void complete(); }); } catch (caught) { fail(caught); }
        finally { stopTracks(); }
      }).finally(() => {
          rejectPendingStop = null;
          disposed = true;
          try { detachListeners(); } finally { stopTracks(); }
      });
      return stopPromise;
    },
    dispose,
    onChunk(listener) {
      if (disposed) return () => undefined;
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
    checkpoint() {
      return false;
    },
    async stop() {
      const blob = createDemoWavBlob(DEMO_AUDIO_DURATION_SECONDS);

      return {
        blob,
        mimeType: blob.type,
        durationSeconds: DEMO_AUDIO_DURATION_SECONDS
      };
    },
    async dispose() {
      return undefined;
    },
    onChunk() {
      return () => undefined;
    }
  };
}
