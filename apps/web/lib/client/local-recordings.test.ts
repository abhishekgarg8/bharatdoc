import { describe, expect, it } from "vitest";
import {
  createMemoryLocalRecordingRepository,
  localRecordingAudioBlob,
  mapLocalRecordingsToDashboardRecords,
  mapQuarantinedLocalRecordings,
  recoverQuarantinedLocalRecordingForScope,
  toLocalDashboardRecord,
  type LocalRecording
} from "@/lib/client/local-recordings";

function audioBlob(): Blob {
  return new Blob(["audio"], { type: "audio/webm" });
}

const baseRecording: LocalRecording = {
  id: "local-recording",
  authUserId: "auth-user-1",
  doctorId: "doctor-1",
  clinicId: "clinic-1",
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
const baseScope = { authUserId: "auth-user-1", doctorId: "doctor-1", clinicId: "clinic-1" };

describe("local recording repository", () => {
  it("creates normalized drafts and tracks persisted capture state", async () => {
    const repository = createMemoryLocalRecordingRepository();

    const draft = await repository.createDraft({
      id: "draft-1",
      scope: {
        authUserId: "auth-user-1",
        doctorId: "doctor-1",
        clinicId: "clinic-1"
      },
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
      authUserId: "auth-user-1",
      doctorId: "doctor-1",
      clinicId: "clinic-1",
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
      new Date("2026-04-23T09:00:00.000Z"),
      baseScope
    );

    expect(records.map((record) => record.id)).toEqual(["local-recording"]);
  });

  it("filters local dashboard records by authenticated doctor scope", () => {
    const records = mapLocalRecordingsToDashboardRecords(
      [
        baseRecording,
        {
          ...baseRecording,
          id: "other-doctor",
          doctorId: "doctor-2",
          patientId: "P-OTHER"
        },
        {
          ...baseRecording,
          id: "legacy-unscoped",
          authUserId: null,
          doctorId: null,
          clinicId: null,
          patientId: "P-LEGACY"
        }
      ],
      new Date("2026-04-23T09:00:00.000Z"),
      {
        authUserId: "auth-user-1",
        doctorId: "doctor-1",
        clinicId: "clinic-1"
      }
    );

    expect(records.map((record) => record.patientId)).toEqual(["P-10482"]);
  });

  it("quarantines visible local recordings without a complete matching authenticated scope", () => {
    const recordings = [
      baseRecording,
      {
        ...baseRecording,
        id: "wrong-doctor",
        doctorId: "doctor-2",
        patientId: "P-WRONG-DOCTOR"
      },
      {
        ...baseRecording,
        id: "legacy-unscoped",
        authUserId: null,
        doctorId: null,
        clinicId: null,
        patientId: "P-LEGACY"
      },
      {
        ...baseRecording,
        id: "missing-clinic",
        clinicId: null,
        patientId: "P-MISSING-CLINIC"
      }
    ];
    expect(mapLocalRecordingsToDashboardRecords(recordings, new Date("2026-04-23T09:00:00.000Z"), baseScope).map((record) => record.id)).toEqual([
      "local-recording"
    ]);
    const quarantined = mapQuarantinedLocalRecordings(recordings, new Date("2026-04-23T09:00:00.000Z"), baseScope);

    expect(quarantined.map((record) => record.id)).toEqual(["legacy-unscoped"]);
    expect(quarantined[0]).toMatchObject({ duration: "2:05", recordedAt: "2026-04-23T06:12:00.000Z" });
    expect(JSON.stringify(quarantined)).not.toContain("P-LEGACY");
    expect(JSON.stringify(quarantined)).not.toContain("P-WRONG-DOCTOR");
    expect(JSON.stringify(quarantined)).not.toContain("P-MISSING-CLINIC");
  });

  it("recovers legacy unscoped recordings into the authenticated scope", async () => {
    const repository = createMemoryLocalRecordingRepository([
      baseRecording,
      {
        ...baseRecording,
        id: "legacy-unscoped",
        authUserId: null,
        doctorId: null,
        clinicId: null,
        patientId: "P-LEGACY"
      },
      {
        ...baseRecording,
        id: "foreign-scoped",
        authUserId: "auth-user-2",
        doctorId: "doctor-2",
        patientId: "P-FOREIGN"
      }
    ]);
    await expect(recoverQuarantinedLocalRecordingForScope(repository, "legacy-unscoped", baseScope)).resolves.toMatchObject(baseScope);
    await expect(recoverQuarantinedLocalRecordingForScope(repository, "foreign-scoped", baseScope)).rejects.toThrow(
      "Only legacy unscoped local recordings can be recovered."
    );
    await expect(recoverQuarantinedLocalRecordingForScope(repository, baseRecording.id, baseScope)).rejects.toThrow(
      "Only legacy unscoped local recordings can be recovered."
    );
  });

  it("recovers interrupted recordings only for the matching authenticated scope", async () => {
    const repository = createMemoryLocalRecordingRepository([
      {
        ...baseRecording,
        id: "matching-recoverable",
        captureState: "recording"
      },
      {
        ...baseRecording,
        id: "foreign-recoverable",
        doctorId: "doctor-2",
        captureState: "recording"
      }
    ]);

    await expect(
      repository.getLatestRecoverable({
        authUserId: "auth-user-1",
        doctorId: "doctor-1",
        clinicId: "clinic-1"
      })
    ).resolves.toMatchObject({ id: "matching-recoverable" });
    await expect(
      repository.getLatestRecoverable({
        authUserId: "auth-user-1",
        doctorId: "doctor-2",
        clinicId: "clinic-1"
      })
    ).resolves.toMatchObject({ id: "foreign-recoverable" });
    await expect(
      repository.getLatestRecoverable({
        authUserId: "auth-user-1",
        doctorId: "doctor-3",
        clinicId: "clinic-1"
      })
    ).resolves.toBeNull();
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
      new Date("2026-04-23T09:00:00.000Z"),
      baseScope
    );

    expect(records.map((record) => record.id)).toEqual(["newer", "local-recording"]);
  });
});
