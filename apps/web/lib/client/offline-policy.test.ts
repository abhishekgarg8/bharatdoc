import { describe, expect, it } from "vitest";
import {
  isAppShellRoute,
  isRecordAudioAsset,
  shouldKeepAudioLocalUntilTranscription
} from "@/lib/client/offline-policy";

describe("offline policy", () => {
  it("recognizes app shell routes that may be cached by the PWA worker", () => {
    expect(isAppShellRoute("/dashboard")).toBe(true);
    expect(isAppShellRoute("/recordings/new?mockRecorder=1")).toBe(true);
    expect(isAppShellRoute("/onboarding")).toBe(true);
    expect(isAppShellRoute("/signup")).toBe(true);
    expect(isAppShellRoute("/api/recordings")).toBe(false);
    expect(isAppShellRoute("/recordings/p-10482")).toBe(false);
  });

  it("recognizes audio assets and transcription posts as non-shell data", () => {
    expect(isRecordAudioAsset("/local/recording.webm")).toBe(true);
    expect(isRecordAudioAsset("https://worker.example.com/api/transcribe")).toBe(true);
    expect(isRecordAudioAsset("/upload", "audio/webm")).toBe(true);
    expect(isRecordAudioAsset("/dashboard", "text/html")).toBe(false);
  });

  it("keeps audio local until the user explicitly starts transcription", () => {
    expect(
      shouldKeepAudioLocalUntilTranscription({
        hasExplicitTranscriptionIntent: false,
        pathname: "/local/recording.webm"
      })
    ).toBe(true);

    expect(
      shouldKeepAudioLocalUntilTranscription({
        hasExplicitTranscriptionIntent: true,
        pathname: "https://worker.example.com/api/transcribe"
      })
    ).toBe(false);
  });
});
