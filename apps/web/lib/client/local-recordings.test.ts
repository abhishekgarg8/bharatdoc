import { describe, expect, it, vi } from "vitest";
import {
  AUDIO_CHUNK_INTERVAL_SECONDS,
  LOCAL_RECORDINGS_STORE,
  buildLocalRecordingMetadata,
  createLocalRecordingsRepository,
  type LocalRecordingMetadata
} from "@/lib/client/local-recordings";

class FakeLocalRecordingsDb {
  private readonly rows = new Map<string, LocalRecordingMetadata>();

  async put(_storeName: string, value: LocalRecordingMetadata): Promise<string> {
    this.rows.set(value.id, value);
    return value.id;
  }

  async get(_storeName: string, key: string): Promise<LocalRecordingMetadata | undefined> {
    return this.rows.get(key);
  }

  async getAll(_storeName: string): Promise<LocalRecordingMetadata[]> {
    return Array.from(this.rows.values());
  }

  async delete(_storeName: string, key: string): Promise<void> {
    this.rows.delete(key);
  }
}

describe("local recordings repository", () => {
  it("normalizes metadata for local storage", () => {
    const audioBlob = new Blob(["audio"], { type: "audio/webm" });
    const metadata = buildLocalRecordingMetadata({
      id: "local-recording",
      patientId: " p-10483 ",
      label: "  Follow-up  ",
      durationSeconds: AUDIO_CHUNK_INTERVAL_SECONDS + 1,
      recordedAt: "2026-04-23T10:00:00.000Z",
      audioBlob
    });

    expect(metadata).toMatchObject({
      id: "local-recording",
      patientId: "P-10483",
      label: "Follow-up",
      durationSeconds: 31,
      status: "recorded",
      recordedAt: "2026-04-23T10:00:00.000Z",
      audioBlob,
      audioMimeType: "audio/webm",
      chunkCount: 2
    });
  });

  it("saves, lists, reads, and removes local recording metadata", async () => {
    const fakeDb = new FakeLocalRecordingsDb();
    const openDb = vi.fn(async () => fakeDb);
    const repository = createLocalRecordingsRepository(openDb);
    const older = buildLocalRecordingMetadata({
      id: "older",
      durationSeconds: 10,
      recordedAt: "2026-04-23T09:00:00.000Z"
    });
    const newer = buildLocalRecordingMetadata({
      id: "newer",
      durationSeconds: 20,
      recordedAt: "2026-04-23T10:00:00.000Z"
    });

    await repository.save(older);
    await repository.save(newer);

    expect(await repository.get("older")).toEqual(older);
    expect((await repository.list()).map((recording) => recording.id)).toEqual(["newer", "older"]);

    await repository.remove("older");

    expect(await repository.get("older")).toBeNull();
    expect(openDb).toHaveBeenCalled();
  });

  it("uses the expected object store name", async () => {
    const fakeDb = new FakeLocalRecordingsDb();
    const put = vi.spyOn(fakeDb, "put");
    const repository = createLocalRecordingsRepository(async () => fakeDb);
    const metadata = buildLocalRecordingMetadata({ id: "recording", durationSeconds: 1 });

    await repository.save(metadata);

    expect(put).toHaveBeenCalledWith(LOCAL_RECORDINGS_STORE, metadata);
  });
});
