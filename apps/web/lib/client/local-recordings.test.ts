import { describe, expect, it } from "vitest";
import { createDemoWavBlob } from "@/lib/client/audio-recorder";
import {
  createMemoryLocalRecordingRepository,
  isLocalRecordingQuotaError,
  localRecordingAudioBlob,
  localRecordingStorageError,
  mapLocalRecordingsToDashboardRecords,
  mapQuarantinedLocalRecordings,
  recoverQuarantinedLocalRecordingForScope,
  purgeLocalRecordingsForAuthUser,
  toLocalDashboardRecord,
  type LocalRecording
} from "@/lib/client/local-recordings";

function audioBlob(): Blob {
  return new Blob(["audio"], { type: "audio/webm" });
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
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

  it("reports scoped device usage and purges only the signed-in doctor's recordings", async () => {
    const repository = createMemoryLocalRecordingRepository([
      baseRecording,
      { ...baseRecording, id: "other", authUserId: "auth-user-2", doctorId: "doctor-2" }
    ]);

    await expect(repository.getUsage(baseScope)).resolves.toEqual({ recordings: 1, bytes: 5 });
    await expect(repository.purge(baseScope)).resolves.toBe(1);
    await expect(repository.list()).resolves.toEqual([expect.objectContaining({ id: "other" })]);
  });

  it("purges every former clinic scope for one auth user without touching another account", async () => {
    const repository = createMemoryLocalRecordingRepository([
      baseRecording,
      { ...baseRecording, id: "former-clinic", clinicId: "clinic-old" },
      { ...baseRecording, id: "legacy", authUserId: null, doctorId: null, clinicId: null },
      { ...baseRecording, id: "other-user", authUserId: "auth-user-2" }
    ]);

    await expect(purgeLocalRecordingsForAuthUser("auth-user-1", repository)).resolves.toBe(3);
    await expect(repository.list()).resolves.toEqual([expect.objectContaining({ id: "other-user" })]);
  });

  it("purges unattributable legacy PHI without a session and preserves every scoped account", async () => {
    const repository = createMemoryLocalRecordingRepository([
      baseRecording,
      { ...baseRecording, id: "legacy", authUserId: null, doctorId: null, clinicId: null },
      { ...baseRecording, id: "other-user", authUserId: "auth-user-2" }
    ]);
    await expect(purgeLocalRecordingsForAuthUser(null, repository)).resolves.toBe(1);
    await expect(repository.list()).resolves.toHaveLength(2);
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
      sequence: 0,
      startedAtSeconds: 0,
      patientId: "p-10482"
    });

    expect(recording).toMatchObject({
      patientId: "P-10482",
      durationSeconds: 31,
      captureState: "recording"
    });
    expect(recording.audioChunks).toHaveLength(1);
    expect(recording.audioChunkMetadata).toEqual([
      { sequence: 0, startedAtSeconds: 0, endedAtSeconds: 31, durationSeconds: 31 }
    ]);
    expect(localRecordingAudioBlob(recording)).toBeInstanceOf(Blob);
    await expect(repository.getLatestRecoverable()).resolves.toMatchObject({ id: "draft-1" });
  });

  it("serializes concurrent chunk writes in monotonic sequence", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "ordered" });
    await repository.updateDraft({ id: "ordered", captureState: "recording" });

    await Promise.all([
      repository.appendChunk({
        id: "ordered",
        audioChunk: new Blob(["first"], { type: "audio/webm" }),
        audioMimeType: "audio/webm",
        durationSeconds: 20,
        sequence: 0,
        startedAtSeconds: 0
      }),
      repository.appendChunk({
        id: "ordered",
        audioChunk: new Blob(["second"], { type: "audio/webm" }),
        audioMimeType: "audio/webm",
        durationSeconds: 40,
        sequence: 1,
        startedAtSeconds: 20
      })
    ]);

    const recording = await repository.get("ordered");
    expect(recording?.audioChunks).toHaveLength(2);
    expect(recording?.audioChunkMetadata).toEqual([
      { sequence: 0, startedAtSeconds: 0, endedAtSeconds: 20, durationSeconds: 20 },
      { sequence: 1, startedAtSeconds: 20, endedAtSeconds: 40, durationSeconds: 20 }
    ]);
    expect(await blobText(localRecordingAudioBlob(recording!)!)).toBe("firstsecond");
  });

  it("rejects gaps and non-monotonic chunk timing", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "ordered" });
    await repository.updateDraft({ id: "ordered", captureState: "recording" });

    await expect(repository.appendChunk({
      id: "ordered",
      audioChunk: audioBlob(),
      audioMimeType: "audio/webm",
      durationSeconds: 20,
      sequence: 1,
      startedAtSeconds: 0
    })).rejects.toThrow("chunk sequence");

    await repository.appendChunk({
      id: "ordered",
      audioChunk: audioBlob(),
      audioMimeType: "audio/webm",
      durationSeconds: 20,
      sequence: 0,
      startedAtSeconds: 0
    });
    await expect(repository.appendChunk({
      id: "ordered",
      audioChunk: audioBlob(),
      audioMimeType: "audio/webm",
      durationSeconds: 40,
      sequence: 1,
      startedAtSeconds: 21
    })).rejects.toThrow("chunk sequence");
  });

  it("preserves normalized quota identity for callers that provide recovery UX", () => {
    const error = localRecordingStorageError(new DOMException("Quota exceeded", "QuotaExceededError"));

    expect(error.name).toBe("QuotaExceededError");
    expect(isLocalRecordingQuotaError(error)).toBe(true);
    expect(localRecordingStorageError(error).message).toMatch(/device storage is full/i);
  });

  it("assembles fallback WAV checkpoints into a valid recoverable RIFF container", async () => {
    const repository = createMemoryLocalRecordingRepository();
    const first = createDemoWavBlob(1);
    const second = createDemoWavBlob(1);
    await repository.createDraft({ id: "wav-fallback" });
    await repository.updateDraft({ id: "wav-fallback", captureState: "recording" });
    await repository.appendChunk({
      id: "wav-fallback", audioChunk: first, audioMimeType: first.type,
      durationSeconds: 20, sequence: 0, startedAtSeconds: 0
    });
    const recording = await repository.appendChunk({
      id: "wav-fallback", audioChunk: second, audioMimeType: second.type,
      durationSeconds: 40, sequence: 1, startedAtSeconds: 20
    });
    const recovered = localRecordingAudioBlob(recording)!;

    expect(await blobText(recovered.slice(0, 4))).toBe("RIFF");
    expect(await blobText(recovered.slice(8, 12))).toBe("WAVE");
    expect(recovered.size).toBe(44 + (first.size - 44) + (second.size - 44));
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

  it("removes local audio, chunks, transcript, and patient identity after verified server transcription", async () => {
    const repository = createMemoryLocalRecordingRepository([baseRecording]);
    await repository.markTranscribing(baseRecording.id);

    const completed = await repository.markTranscribed(baseRecording.id, "Patient reports fever.");

    expect(completed).toMatchObject({
      patientId: null,
      label: null,
      audioBlob: null,
      audioChunks: [],
      audioChunkMetadata: [],
      audioMimeType: null,
      transcript: null,
      syncState: "transcribed"
    });
    await expect(repository.get(baseRecording.id)).resolves.toBeNull();
  });

  it("uses the canonical finalized container instead of concatenated checkpoint fragments", async () => {
    const repository = createMemoryLocalRecordingRepository();
    await repository.createDraft({ id: "canonical" });
    await repository.updateDraft({ id: "canonical", captureState: "recording" });
    await repository.appendChunk({
      id: "canonical",
      audioChunk: new Blob(["fragment"], { type: "audio/webm" }),
      audioMimeType: "audio/webm",
      durationSeconds: 20,
      sequence: 0,
      startedAtSeconds: 0
    });
    const canonical = createDemoWavBlob(1);
    const finalized = await repository.finalize({
      id: "canonical",
      durationSeconds: 21,
      audioBlob: canonical,
      audioMimeType: canonical.type
    });

    expect(await blobText(localRecordingAudioBlob(finalized)!.slice(0, 4))).toBe("RIFF");
    expect(finalized.audioMimeType).toBe("audio/wav");
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
      transcript: null,
      audioBlob: null,
      audioChunks: []
    });
  });

  it("maps only stopped local recordings into offline dashboard records", () => {
    const dashboardRecord = toLocalDashboardRecord(baseRecording, new Date("2026-04-23T06:30:00.000Z"));

    expect(dashboardRecord).toMatchObject({
      id: "local-recording",
      localRecordingId: "local-recording",
      localCaptureState: "stopped",
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

    expect(records.map((record) => record.id)).toEqual(["in-progress", "local-recording"]);
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
