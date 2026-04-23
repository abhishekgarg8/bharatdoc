import { describe, expect, it } from "vitest";
import {
  createMemoryLocalRecordingRepository,
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
  audioMimeType: "audio/webm",
  syncState: "local",
  serverRecordingId: null,
  transcript: null,
  error: null
};

describe("local recording repository", () => {
  it("creates and lists normalized local recording drafts", async () => {
    const repository = createMemoryLocalRecordingRepository();

    const draft = await repository.createDraft({
      id: "draft-1",
      patientId: " p-10482 ",
      label: "  Walk-in  ",
      recordedAt: "2026-04-23T06:12:00.000Z"
    });

    expect(draft).toMatchObject({
      id: "draft-1",
      patientId: "P-10482",
      label: "Walk-in",
      durationSeconds: 0,
      syncState: "local"
    });
    await expect(repository.list()).resolves.toEqual([draft]);
  });

  it("finalizes recordings with audio and duration constraints", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "draft-1" });

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
      syncState: "local"
    });
    expect(finalized.audioBlob).toBeInstanceOf(Blob);
  });

  it("requires patient IDs before finalizing for transcription", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "draft-1" });

    await expect(
      repository.finalize({
        id: "draft-1",
        patientId: "  ",
        durationSeconds: 10,
        audioBlob: audioBlob(),
        audioMimeType: "audio/webm"
      })
    ).rejects.toThrow("Patient ID is required");
  });

  it("tracks sync and transcription state", async () => {
    const repository = createMemoryLocalRecordingRepository([baseRecording]);

    await expect(repository.markSyncing(baseRecording.id)).resolves.toMatchObject({ syncState: "syncing" });
    await expect(repository.markSynced(baseRecording.id, "server-recording")).resolves.toMatchObject({
      syncState: "synced",
      serverRecordingId: "server-recording"
    });
    await expect(repository.markTranscribing(baseRecording.id)).resolves.toMatchObject({ syncState: "transcribing" });
    await expect(repository.markTranscribed(baseRecording.id, "Patient reports fever.")).resolves.toMatchObject({
      syncState: "transcribed",
      transcript: "Patient reports fever."
    });
  });

  it("maps local recordings into offline dashboard records", () => {
    const dashboardRecord = toLocalDashboardRecord(baseRecording, new Date("2026-04-23T09:00:00.000Z"));

    expect(dashboardRecord).toMatchObject({
      id: "local-recording",
      patientId: "P-10482",
      duration: "2:05",
      doctorName: "You",
      status: "recorded",
      offline: true
    });
    expect(dashboardRecord.time).toContain("Today");
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
