import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createTranscriptionSession, uploadTranscriptionChunk } from "../transcription-sessions.js";
import type { AuthContext, TranscriptionSessionManifest, WorkerDependencies } from "../types.js";

const auth = { doctor: {
  id: "doctor-1", clinic_id: "clinic-1", transcription_lang: "auto",
  firebase_uid: "uid", role: "doctor", account_status: "active", name: "Doctor",
  specialization: "General", phone: "+919876543210", profile_photo_path: null, custom_prompt: null,
  created_at: "2026-07-14T00:00:00Z"
}, token: { uid: "uid" } } as AuthContext;

function manifest(state: TranscriptionSessionManifest["session"]["state"] = "accepting"): TranscriptionSessionManifest {
  return { session: {
    id: "session-1", recordingId: "recording-1", doctorId: "doctor-1", clinicId: "clinic-1",
    expectedChunkCount: 3, state, language: "auto", model: "gpt-4o-mini-transcribe",
    mimeType: null, idempotencyKey: "key-1", createdAt: "2026-07-14T00:00:00Z"
  }, chunks: [], missingChunkIndices: [0, 1, 2], failedChunkIndices: [], completedChunkIndices: [], objectPaths: [] };
}

function dependencies() {
  const current = manifest();
  const chunks = new Map<number, TranscriptionSessionManifest["chunks"][number]>();
  const repository = {
    create: vi.fn(async () => ({ disposition: "created" as const, manifest: current })),
    get: vi.fn(async (input: { doctorId: string; clinicId: string }) => {
      if (input.doctorId !== "doctor-1" || input.clinicId !== "clinic-1") return null;
      const rows = [...chunks.values()].sort((a, b) => a.index - b.index);
      const present = new Set(rows.map((chunk) => chunk.index));
      return { ...current, chunks: rows,
        missingChunkIndices: [0, 1, 2].filter((index) => !present.has(index)),
        failedChunkIndices: rows.filter((chunk) => chunk.state === "failed").map((chunk) => chunk.index),
        completedChunkIndices: rows.filter((chunk) => chunk.state === "completed").map((chunk) => chunk.index),
        objectPaths: rows.map((chunk) => chunk.storagePath) };
    }),
    claimChunk: vi.fn(async (input: { index: number; count: number; bytes: number; durationSeconds: number; mimeType: string; checksum: string; storagePath: string }) => {
      const existing = chunks.get(input.index);
      if (existing) return { disposition: "existing" as const, chunk: existing };
      const chunk = { ...input, state: "receiving" as const, transcript: null, errorCode: null, errorMessage: null };
      chunks.set(input.index, chunk);
      return { disposition: "accepted" as const, chunk };
    }),
    markStored: vi.fn(async ({ index }: { index: number }) => { chunks.get(index)!.state = "stored"; }),
    markProviderSubmitted: vi.fn(async ({ index }: { index: number }) => {
      const chunk = chunks.get(index)!;
      if (chunk.state !== "stored") return false;
      chunk.state = "provider_submitted";
      return true;
    }),
    completeChunk: vi.fn(async ({ index, transcript }: { index: number; transcript: string }) => {
      Object.assign(chunks.get(index)!, { state: "completed", transcript });
    }),
    failChunk: vi.fn(async () => undefined)
  };
  const deps = {
    transcriptionSessions: repository,
    audioStorage: {
      transcriptionChunkPath: vi.fn(() => "clinic-1/doctor-1/recording-1/sessions/session-1/chunks/0002.webm"),
      uploadTranscriptionChunk: vi.fn(async (input: { storagePath: string }) => input.storagePath),
      downloadRecordingAudio: vi.fn(async () => { throw new Error("not found"); })
    },
    transcriptionClient: { transcribe: vi.fn(async () => "independently encoded chunk") }
  } as unknown as WorkerDependencies;
  return { deps, repository, chunks };
}

describe("durable transcription sessions", () => {
  it("creates the server session before accepting independently recorded media chunks", async () => {
    const { deps, repository } = dependencies();
    await expect(createTranscriptionSession(auth, {
      recordingId: "recording-1", expectedChunkCount: 3, idempotencyKey: "key-1"
    }, deps, "gpt-4o-mini-transcribe")).resolves.toMatchObject({ session: { expectedChunkCount: 3 } });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ doctorId: "doctor-1", clinicId: "clinic-1" }));
  });

  it("accepts an out-of-order chunk as one real media object and makes identical retries read-only", async () => {
    const { deps } = dependencies();
    const input = { sessionId: "session-1", index: 2, count: 3, durationSeconds: 8,
      audio: { buffer: Buffer.from("complete webm chunk"), mimetype: "audio/webm", originalname: "chunk.webm", size: 19 } };
    await expect(uploadTranscriptionChunk(auth, input, deps)).resolves.toMatchObject({ outcome: "completed" });
    await expect(uploadTranscriptionChunk(auth, input, deps)).resolves.toMatchObject({ outcome: "completed" });
    expect(deps.audioStorage.uploadTranscriptionChunk).toHaveBeenCalledTimes(1);
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalledTimes(1);
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalledWith(expect.objectContaining({ audio: input.audio.buffer }));
  });

  it("reports an interrupted out-of-order upload from canonical server state", async () => {
    const { deps } = dependencies();
    for (const index of [2, 0]) await uploadTranscriptionChunk(auth, { sessionId: "session-1", index, count: 3,
      durationSeconds: 8, audio: { buffer: Buffer.from(`chunk-${index}`), mimetype: "audio/webm",
        originalname: `${index}.webm`, size: 7 } }, deps);
    await expect(deps.transcriptionSessions!.get({ sessionId: "session-1", doctorId: "doctor-1", clinicId: "clinic-1" }))
      .resolves.toMatchObject({ missingChunkIndices: [1], completedChunkIndices: [0, 2] });
  });

  it("resumes a receiving claim without re-slicing or abandoning the chunk", async () => {
    const { deps, chunks } = dependencies();
    const audio = Buffer.from("audio");
    chunks.set(1, { index: 1, count: 3, bytes: audio.length, durationSeconds: 8, mimeType: "audio/webm",
      checksum: createHash("sha256").update(audio).digest("hex"), storagePath: "path", state: "receiving",
      transcript: null, errorCode: null, errorMessage: null });
    await expect(uploadTranscriptionChunk(auth, { sessionId: "session-1", index: 1, count: 3, durationSeconds: 8,
      audio: { buffer: audio, mimetype: "audio/webm", originalname: "1.webm", size: audio.length } }, deps))
      .resolves.toMatchObject({ outcome: "completed" });
    expect(deps.audioStorage.uploadTranscriptionChunk).toHaveBeenCalledTimes(1);
  });

  it("rejects conflicting bytes at an immutable chunk index", async () => {
    const { deps } = dependencies();
    const base = { sessionId: "session-1", index: 0, count: 3, durationSeconds: 8 };
    await uploadTranscriptionChunk(auth, { ...base, audio: { buffer: Buffer.from("first"), mimetype: "audio/webm", originalname: "0.webm", size: 5 } }, deps);
    await expect(uploadTranscriptionChunk(auth, { ...base, audio: { buffer: Buffer.from("other"), mimetype: "audio/webm", originalname: "0.webm", size: 5 } }, deps))
      .rejects.toMatchObject({ code: "TRANSCRIPTION_CHUNK_IMMUTABLE" });
  });

  it("never repeats a provider call for an ambiguous provider_submitted chunk", async () => {
    const { deps, chunks } = dependencies();
    const checksum = createHash("sha256").update("audio").digest("hex");
    chunks.set(0, { index: 0, count: 3, bytes: 5, durationSeconds: 8, mimeType: "audio/webm",
      checksum, storagePath: "path", state: "provider_submitted", transcript: null,
      errorCode: null, errorMessage: null });
    await expect(uploadTranscriptionChunk(auth, { sessionId: "session-1", index: 0, count: 3, durationSeconds: 8,
      audio: { buffer: Buffer.from("audio"), mimetype: "audio/webm", originalname: "chunk.webm", size: 5 } }, deps))
      .resolves.toMatchObject({ outcome: "in_progress", chunk: { state: "provider_submitted" } });
    expect(deps.audioStorage.uploadTranscriptionChunk).not.toHaveBeenCalled();
    expect(deps.transcriptionClient.transcribe).not.toHaveBeenCalled();
  });

  it("does not replay the provider if persistence fails after the provider response", async () => {
    const { deps, repository } = dependencies();
    repository.completeChunk.mockRejectedValueOnce(new Error("database unavailable"));
    const input = { sessionId: "session-1", index: 0, count: 3, durationSeconds: 8,
      audio: { buffer: Buffer.from("audio"), mimetype: "audio/webm", originalname: "0.webm", size: 5 } };
    await expect(uploadTranscriptionChunk(auth, input, deps)).rejects.toThrow("database unavailable");
    await expect(uploadTranscriptionChunk(auth, input, deps)).resolves.toMatchObject({ outcome: "in_progress" });
    expect(deps.transcriptionClient.transcribe).toHaveBeenCalledTimes(1);
  });

  it("hides sessions across both doctor and clinic boundaries", async () => {
    const { deps } = dependencies();
    const other = { ...auth, doctor: { ...auth.doctor, id: "doctor-2", clinic_id: "clinic-2" } };
    await expect(uploadTranscriptionChunk(other, { sessionId: "session-1", index: 0, count: 3, durationSeconds: 8,
      audio: { buffer: Buffer.from("audio"), mimetype: "audio/webm", originalname: "0.webm", size: 5 } }, deps))
      .rejects.toMatchObject({ code: "TRANSCRIPTION_SESSION_NOT_FOUND" });
  });

  it.each([
    [{ index: 3, count: 3, durationSeconds: 8 }, "TRANSCRIPTION_CHUNK_INDEX_INVALID"],
    [{ index: 0, count: 4, durationSeconds: 8 }, "TRANSCRIPTION_CHUNK_COUNT_INVALID"],
    [{ index: 0, count: 3, durationSeconds: 0 }, "TRANSCRIPTION_CHUNK_DURATION_INVALID"]
  ])("rejects invalid chunk bounds", async (values, code) => {
    const { deps } = dependencies();
    await expect(uploadTranscriptionChunk(auth, { sessionId: "session-1", ...values,
      audio: { buffer: Buffer.from("audio"), mimetype: "audio/webm", originalname: "chunk.webm", size: 5 } }, deps))
      .rejects.toMatchObject({ code });
  });

  it("rejects non-audio and unsupported containers", async () => {
    const { deps } = dependencies();
    await expect(uploadTranscriptionChunk(auth, { sessionId: "session-1", index: 0, count: 3, durationSeconds: 8,
      audio: { buffer: Buffer.from("audio"), mimetype: "video/webm", originalname: "0.webm", size: 5 } }, deps))
      .rejects.toMatchObject({ code: "TRANSCRIPTION_CHUNK_MIME_INVALID" });
  });
});
