import { describe, expect, it } from "vitest";
import {
  createMemoryLocalRecordingRepository,
  localRecordingAudioBlob,
  mapLocalRecordingsToDashboardRecords,
  toLocalDashboardRecord,
  type LocalRecording
} from "@/lib/client/local-recordings";

function audioBlob(): Blob {
  return new Blob(["audio"], { type: "audio/webm" });
}

const baseRecording: LocalRecording = {
  id: "local-recording",
  patientId: "P-10482",
  label: null,
  durationSeconds: 125,
  recordedAt: "2026-04-23T06:12:00.000Z",
  updatedAt: "2026-04-23T06:12:00.000Z",
  audioBlob: audioBlob(),
  audioChunks: [audioBlob()],
  audioMimeType: "audio/webm",
  captureState: "stopped",
  syncState: "local",
  serverRecordingId: null,
  transcript: null,
  error: null
};

describe("local recording repository", () => {
  it("creates normalized drafts and tracks persisted capture state", async () => {
    const repository = createMemoryLocalRecordingRepository();

    const draft = await repository.createDraft({
      id: "draft-1",
      patientId: " p-10482 ",
      label: "  Walk-in  ",
      recordedAt: "2026-04-23T06:12:00.000Z"
    });
    const updated = await repository.updateDraft({
      id: "draft-1",
      captureState: "recording",
      durationSeconds: 0
    });

    expect(draft).toMatchObject({
      id: "draft-1",
      patientId: "P-10482",
      label: "Walk-in",
      durationSeconds: 0,
      captureState: "idle",
      syncState: "local"
    });
    expect(updated.captureState).toBe("recording");
  });

  it("appends chunks and rebuilds audio for interrupted sessions", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "draft-1" });
    await repository.updateDraft({ id: "draft-1", captureState: "recording", durationSeconds: 0 });

    const recording = await repository.appendChunk({
      id: "draft-1",
      audioChunk: audioBlob(),
      audioMimeType: "audio/webm",
      durationSeconds: 31,
      patientId: "p-10482"
    });

    expect(recording).toMatchObject({
      patientId: "P-10482",
      durationSeconds: 31,
      captureState: "recording"
    });
    expect(recording.audioChunks).toHaveLength(1);
    expect(localRecordingAudioBlob(recording)).toBeInstanceOf(Blob);
    await expect(repository.getLatestRecoverable()).resolves.toMatchObject({ id: "draft-1" });
  });

  it("finalizes recordings with audio and duration constraints", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "draft-1" });
    await repository.updateDraft({ id: "draft-1", captureState: "recording", durationSeconds: 0 });

    const finalized = await repository.finalize({
      id: "draft-1",
      patientId: " p-10482 ",
      durationSeconds: 65.8,
      audioBlob: audioBlob(),
      audioMimeType: "audio/webm"
    });

    expect(finalized).toMatchObject({
      patientId: "P-10482",
      durationSeconds: 65,
      audioMimeType: "audio/webm",
      captureState: "stopped",
      syncState: "local"
    });
    expect(finalized.audioBlob).toBeInstanceOf(Blob);
  });

  it("allows finalizing audio before Patient ID is assigned", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "draft-1" });
    await repository.updateDraft({ id: "draft-1", captureState: "recording", durationSeconds: 0 });

    const finalized = await repository.finalize({
      id: "draft-1",
      patientId: "  ",
      durationSeconds: 10,
      audioBlob: audioBlob(),
      audioMimeType: "audio/webm"
    });

    expect(finalized).toMatchObject({
      patientId: null,
      captureState: "stopped",
      syncState: "local"
    });
    expect(finalized.audioBlob).toBeInstanceOf(Blob);
  });

  it("tracks sync and transcription state", async () => {
    const repository = createMemoryLocalRecordingRepository([baseRecording]);

    await expect(repository.markSyncing(baseRecording.id)).resolves.toMatchObject({ syncState: "syncing" });
    await expect(repository.markSynced(baseRecording.id, "server-recording")).resolves.toMatchObject({
      syncState: "synced",
      serverRecordingId: "server-recording"
    });
    await expect(repository.markTranscribing(baseRecording.id)).resolves.toMatchObject({
      syncState: "transcribing",
      captureState: "transcribing"
    });
    await expect(repository.markTranscribed(baseRecording.id, "Patient reports fever.")).resolves.toMatchObject({
      syncState: "transcribed",
      captureState: "transcribed",
      transcript: "Patient reports fever."
    });
  });

  it("maps only stopped local recordings into offline dashboard records", () => {
    const dashboardRecord = toLocalDashboardRecord(baseRecording, new Date("2026-04-23T06:30:00.000Z"));

    expect(dashboardRecord).toMatchObject({
      id: "local-recording",
      patientId: "P-10482",
      duration: "2:05",
      doctorName: "You",
      status: "recorded",
      offline: true
    });
    expect(dashboardRecord.time).toContain("Today");

    const records = mapLocalRecordingsToDashboardRecords(
      [
        {
          ...baseRecording,
          id: "in-progress",
          captureState: "recording",
          audioBlob: null,
          audioChunks: [audioBlob()]
        },
        baseRecording
      ],
      new Date("2026-04-23T09:00:00.000Z")
    );

    expect(records.map((record) => record.id)).toEqual(["local-recording"]);
  });

  it("sorts local dashboard records by newest first", () => {
    const records = mapLocalRecordingsToDashboardRecords(
      [
        baseRecording,
        {
          ...baseRecording,
          id: "newer",
          recordedAt: "2026-04-23T07:12:00.000Z"
        }
      ],
      new Date("2026-04-23T09:00:00.000Z")
    );

    expect(records.map((record) => record.id)).toEqual(["newer", "local-recording"]);
  });
});
