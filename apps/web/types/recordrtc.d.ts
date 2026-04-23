declare module "recordrtc" {
  interface RecordRTCInstance {
    startRecording(): void;
    pauseRecording(): void;
    resumeRecording(): void;
    stopRecording(callback?: () => void): void;
    getBlob(): Blob | null;
    destroy(): void;
  }

  type RecordRTCFactory = (stream: MediaStream, options: Record<string, unknown>) => RecordRTCInstance;

  const RecordRTC: RecordRTCFactory;
  export default RecordRTC;
}
