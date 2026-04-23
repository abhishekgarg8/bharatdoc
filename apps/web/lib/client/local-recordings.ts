import { assertRecordingDuration, normalizePatientId, type RecordingStatus } from "@bharatdoc/shared";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  formatRecordedAt,
  formatRecordingDuration,
  type LocalDashboardRecord
} from "@/lib/client/dashboard-data";

export type LocalRecordingSyncState = "local" | "syncing" | "synced" | "transcribing" | "transcribed" | "failed";

export interface LocalRecording {
  id: string;
  patientId: string | null;
  label: string | null;
  durationSeconds: number;
  recordedAt: string;
  updatedAt: string;
  audioBlob: Blob | null;
  audioMimeType: string | null;
  syncState: LocalRecordingSyncState;
  serverRecordingId: string | null;
  transcript: string | null;
  error: string | null;
}

export interface LocalRecordingDraftInput {
  id?: string;
  patientId?: string | null;
  label?: string | null;
  recordedAt?: string;
}

export interface FinalizeLocalRecordingInput {
  id: string;
  patientId: string;
  label?: string | null;
  durationSeconds: number;
  audioBlob: Blob;
  audioMimeType: string;
}

export interface LocalRecordingRepository {
  createDraft(input?: LocalRecordingDraftInput): Promise<LocalRecording>;
  save(recording: LocalRecording): Promise<LocalRecording>;
  get(id: string): Promise<LocalRecording | null>;
  list(): Promise<LocalRecording[]>;
  remove(id: string): Promise<void>;
  finalize(input: FinalizeLocalRecordingInput): Promise<LocalRecording>;
  markSyncing(id: string): Promise<LocalRecording>;
  markSynced(id: string, serverRecordingId: string): Promise<LocalRecording>;
  markTranscribing(id: string): Promise<LocalRecording>;
  markTranscribed(id: string, transcript: string): Promise<LocalRecording>;
  markFailed(id: string, error: string): Promise<LocalRecording>;
}

interface BharatDocRecordingDb extends DBSchema {
  recordings: {
    key: string;
    value: LocalRecording;
    indexes: {
      "by-recorded-at": string;
    };
  };
}

const DB_NAME = "bharatdoc-local-recordings";
const STORE_NAME = "recordings";

export function createLocalRecordingId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeOptionalPatientId(value: string | null | undefined): string | null {
  const normalized = normalizePatientId(value ?? "");
  return normalized ? normalized : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireExisting(recording: LocalRecording | null, id: string): LocalRecording {
  if (!recording) {
    throw new Error(`Local recording ${id} was not found.`);
  }

  return recording;
}

function sortByNewest(recordings: LocalRecording[]): LocalRecording[] {
  return [...recordings].sort((left, right) => Date.parse(right.recordedAt) - Date.parse(left.recordedAt));
}

async function openLocalRecordingDb(): Promise<IDBPDatabase<BharatDocRecordingDb>> {
  return openDB<BharatDocRecordingDb>(DB_NAME, 1, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("by-recorded-at", "recordedAt");
    }
  });
}

abstract class BaseLocalRecordingRepository implements LocalRecordingRepository {
  abstract save(recording: LocalRecording): Promise<LocalRecording>;
  abstract get(id: string): Promise<LocalRecording | null>;
  abstract list(): Promise<LocalRecording[]>;
  abstract remove(id: string): Promise<void>;

  async createDraft(input: LocalRecordingDraftInput = {}): Promise<LocalRecording> {
    const timestamp = input.recordedAt ?? nowIso();
    return this.save({
      id: input.id ?? createLocalRecordingId(),
      patientId: normalizeOptionalPatientId(input.patientId),
      label: normalizeOptionalText(input.label),
      durationSeconds: 0,
      recordedAt: timestamp,
      updatedAt: timestamp,
      audioBlob: null,
      audioMimeType: null,
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    });
  }

  async finalize(input: FinalizeLocalRecordingInput): Promise<LocalRecording> {
    const current = requireExisting(await this.get(input.id), input.id);
    const patientId = normalizePatientId(input.patientId);

    if (!patientId) {
      throw new Error("Patient ID is required before transcription.");
    }

    return this.save({
      ...current,
      patientId,
      label: normalizeOptionalText(input.label),
      durationSeconds: assertRecordingDuration(input.durationSeconds),
      audioBlob: input.audioBlob,
      audioMimeType: input.audioMimeType,
      syncState: "local",
      updatedAt: nowIso(),
      error: null
    });
  }

  async markSyncing(id: string): Promise<LocalRecording> {
    const current = requireExisting(await this.get(id), id);
    return this.save({ ...current, syncState: "syncing", updatedAt: nowIso(), error: null });
  }

  async markSynced(id: string, serverRecordingId: string): Promise<LocalRecording> {
    const current = requireExisting(await this.get(id), id);
    return this.save({
      ...current,
      syncState: "synced",
      serverRecordingId,
      updatedAt: nowIso(),
      error: null
    });
  }

  async markTranscribing(id: string): Promise<LocalRecording> {
    const current = requireExisting(await this.get(id), id);
    return this.save({ ...current, syncState: "transcribing", updatedAt: nowIso(), error: null });
  }

  async markTranscribed(id: string, transcript: string): Promise<LocalRecording> {
    const current = requireExisting(await this.get(id), id);
    return this.save({
      ...current,
      syncState: "transcribed",
      transcript: transcript.trim(),
      updatedAt: nowIso(),
      error: null
    });
  }

  async markFailed(id: string, error: string): Promise<LocalRecording> {
    const current = requireExisting(await this.get(id), id);
    return this.save({
      ...current,
      syncState: "failed",
      error: error.trim() || "Recording workflow failed.",
      updatedAt: nowIso()
    });
  }
}

export class IndexedDbLocalRecordingRepository extends BaseLocalRecordingRepository {
  async save(recording: LocalRecording): Promise<LocalRecording> {
    const db = await openLocalRecordingDb();
    await db.put(STORE_NAME, recording);
    return recording;
  }

  async get(id: string): Promise<LocalRecording | null> {
    const db = await openLocalRecordingDb();
    return (await db.get(STORE_NAME, id)) ?? null;
  }

  async list(): Promise<LocalRecording[]> {
    const db = await openLocalRecordingDb();
    return sortByNewest(await db.getAll(STORE_NAME));
  }

  async remove(id: string): Promise<void> {
    const db = await openLocalRecordingDb();
    await db.delete(STORE_NAME, id);
  }
}

export class MemoryLocalRecordingRepository extends BaseLocalRecordingRepository {
  private readonly records = new Map<string, LocalRecording>();

  constructor(initialRecords: LocalRecording[] = []) {
    super();
    for (const record of initialRecords) {
      this.records.set(record.id, record);
    }
  }

  async save(recording: LocalRecording): Promise<LocalRecording> {
    this.records.set(recording.id, recording);
    return recording;
  }

  async get(id: string): Promise<LocalRecording | null> {
    return this.records.get(id) ?? null;
  }

  async list(): Promise<LocalRecording[]> {
    return sortByNewest([...this.records.values()]);
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}

export function createIndexedDbLocalRecordingRepository(): LocalRecordingRepository {
  return new IndexedDbLocalRecordingRepository();
}

export function createMemoryLocalRecordingRepository(initialRecords: LocalRecording[] = []): LocalRecordingRepository {
  return new MemoryLocalRecordingRepository(initialRecords);
}

export function localRecordingStatus(recording: LocalRecording): RecordingStatus {
  return recording.syncState === "transcribed" ? "transcribed" : "recorded";
}

export function toLocalDashboardRecord(recording: LocalRecording, now = new Date()): LocalDashboardRecord {
  return {
    id: recording.serverRecordingId ?? recording.id,
    patientId: recording.patientId ?? recording.label ?? "Unassigned",
    time: formatRecordedAt(recording.recordedAt, now),
    duration: formatRecordingDuration(recording.durationSeconds),
    doctorName: "You",
    status: localRecordingStatus(recording),
    recordedAt: recording.recordedAt,
    offline: true
  };
}

export function mapLocalRecordingsToDashboardRecords(
  recordings: LocalRecording[],
  now = new Date()
): LocalDashboardRecord[] {
  return sortByNewest(recordings).map((recording) => toLocalDashboardRecord(recording, now));
}
