import { openDB, type IDBPDatabase } from "idb";
import { assertRecordingDuration, normalizePatientId, type RecordingStatus } from "@bharatdoc/shared";

export const LOCAL_RECORDINGS_DB = "bharatdoc-local-recordings";
export const LOCAL_RECORDINGS_STORE = "recordings";
export const AUDIO_CHUNK_INTERVAL_SECONDS = 30;

export interface LocalRecordingMetadata {
  id: string;
  patientId: string | null;
  label: string | null;
  durationSeconds: number;
  status: RecordingStatus;
  recordedAt: string;
  updatedAt: string;
  audioBlob?: Blob;
  audioMimeType: string | null;
  chunkCount: number;
}

interface LocalRecordingsSchema {
  recordings: {
    key: string;
    value: LocalRecordingMetadata;
    indexes: {
      "by-recorded-at": string;
      "by-patient-id": string;
    };
  };
}

type LocalRecordingsDb = IDBPDatabase<LocalRecordingsSchema>;

interface DbLike {
  put(storeName: string, value: LocalRecordingMetadata): Promise<unknown>;
  get(storeName: string, key: string): Promise<LocalRecordingMetadata | undefined>;
  getAll(storeName: string): Promise<LocalRecordingMetadata[]>;
  delete(storeName: string, key: string): Promise<void>;
}

export interface LocalRecordingsRepository {
  save(recording: LocalRecordingMetadata): Promise<LocalRecordingMetadata>;
  get(id: string): Promise<LocalRecordingMetadata | null>;
  list(): Promise<LocalRecordingMetadata[]>;
  remove(id: string): Promise<void>;
}

export interface LocalRecordingDraft {
  id?: string;
  patientId?: string | null;
  label?: string | null;
  durationSeconds: number;
  recordedAt?: string;
  updatedAt?: string;
  audioBlob?: Blob;
  audioMimeType?: string | null;
}

function cleanOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanPatientId(value: string | null | undefined): string | null {
  const normalized = normalizePatientId(value ?? "");
  return normalized ? normalized : null;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildLocalRecordingMetadata(input: LocalRecordingDraft): LocalRecordingMetadata {
  const durationSeconds = assertRecordingDuration(input.durationSeconds);
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const metadata: LocalRecordingMetadata = {
    id: input.id ?? createId(),
    patientId: cleanPatientId(input.patientId),
    label: cleanOptionalText(input.label),
    durationSeconds,
    status: "recorded",
    recordedAt,
    updatedAt: input.updatedAt ?? recordedAt,
    audioMimeType: input.audioMimeType ?? input.audioBlob?.type ?? null,
    chunkCount: Math.max(1, Math.ceil(durationSeconds / AUDIO_CHUNK_INTERVAL_SECONDS))
  };

  if (input.audioBlob) {
    metadata.audioBlob = input.audioBlob;
  }

  return metadata;
}

export async function openLocalRecordingsDb(): Promise<LocalRecordingsDb> {
  return openDB<LocalRecordingsSchema>(LOCAL_RECORDINGS_DB, 1, {
    upgrade(db) {
      if (db.objectStoreNames.contains(LOCAL_RECORDINGS_STORE)) {
        return;
      }

      const store = db.createObjectStore(LOCAL_RECORDINGS_STORE, { keyPath: "id" });
      store.createIndex("by-recorded-at", "recordedAt");
      store.createIndex("by-patient-id", "patientId");
    }
  });
}

export function createLocalRecordingsRepository(openDb: () => Promise<DbLike> = openLocalRecordingsDb): LocalRecordingsRepository {
  async function db(): Promise<DbLike> {
    return openDb();
  }

  return {
    async save(recording: LocalRecordingMetadata): Promise<LocalRecordingMetadata> {
      await (await db()).put(LOCAL_RECORDINGS_STORE, recording);
      return recording;
    },

    async get(id: string): Promise<LocalRecordingMetadata | null> {
      return (await (await db()).get(LOCAL_RECORDINGS_STORE, id)) ?? null;
    },

    async list(): Promise<LocalRecordingMetadata[]> {
      const recordings = await (await db()).getAll(LOCAL_RECORDINGS_STORE);
      return recordings.sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt));
    },

    async remove(id: string): Promise<void> {
      await (await db()).delete(LOCAL_RECORDINGS_STORE, id);
    }
  };
}
