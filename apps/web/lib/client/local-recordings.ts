import {
  assertLocalRecordingTransition,
  assertRecordingDuration,
  normalizePatientId,
  type LocalRecordingCaptureState,
  type RecordingStatus
} from "@bharatdoc/shared";
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
  audioChunks: Blob[];
  audioMimeType: string | null;
  captureState: LocalRecordingCaptureState;
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

export interface UpdateLocalRecordingDraftInput {
  id: string;
  patientId?: string | null;
  label?: string | null;
  durationSeconds?: number;
  captureState?: LocalRecordingCaptureState;
}

export interface AppendAudioChunkInput {
  id: string;
  audioChunk: Blob;
  audioMimeType: string;
  durationSeconds: number;
  patientId?: string | null;
  label?: string | null;
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
  updateDraft(input: UpdateLocalRecordingDraftInput): Promise<LocalRecording>;
  appendChunk(input: AppendAudioChunkInput): Promise<LocalRecording>;
  getLatestRecoverable(): Promise<LocalRecording | null>;
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

function nextCaptureState(
  current: LocalRecordingCaptureState,
  nextState: LocalRecordingCaptureState | undefined
): LocalRecordingCaptureState {
  if (!nextState || nextState === current) {
    return current;
  }

  return assertLocalRecordingTransition(current, nextState);
}

async function openLocalRecordingDb(): Promise<IDBPDatabase<BharatDocRecordingDb>> {
  return openDB<BharatDocRecordingDb>(DB_NAME, 2, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      const store =
        oldVersion === 0
          ? db.createObjectStore(STORE_NAME, { keyPath: "id" })
          : transaction.objectStore(STORE_NAME);

      if (!store.indexNames.contains("by-recorded-at")) {
        store.createIndex("by-recorded-at", "recordedAt");
      }
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
      audioChunks: [],
      audioMimeType: null,
      captureState: "idle",
      syncState: "local",
      serverRecordingId: null,
      transcript: null,
      error: null
    });
  }

  async updateDraft(input: UpdateLocalRecordingDraftInput): Promise<LocalRecording> {
    const current = requireExisting(await this.get(input.id), input.id);

    return this.save({
      ...current,
      patientId: input.patientId !== undefined ? normalizeOptionalPatientId(input.patientId) : current.patientId,
      label: input.label !== undefined ? normalizeOptionalText(input.label) : current.label,
      durationSeconds: input.durationSeconds !== undefined ? assertRecordingDuration(input.durationSeconds) : current.durationSeconds,
      captureState: nextCaptureState(current.captureState, input.captureState),
      updatedAt: nowIso(),
      error: null
    });
  }

  async appendChunk(input: AppendAudioChunkInput): Promise<LocalRecording> {
    const current = requireExisting(await this.get(input.id), input.id);

    return this.save({
      ...current,
      patientId: input.patientId !== undefined ? normalizeOptionalPatientId(input.patientId) : current.patientId,
      label: input.label !== undefined ? normalizeOptionalText(input.label) : current.label,
      durationSeconds: assertRecordingDuration(input.durationSeconds),
      audioChunks: [...current.audioChunks, input.audioChunk],
      audioMimeType: input.audioMimeType,
      captureState: current.captureState === "paused" ? current.captureState : nextCaptureState(current.captureState, "recording"),
      updatedAt: nowIso(),
      error: null
    });
  }

  async getLatestRecoverable(): Promise<LocalRecording | null> {
    const recordings = await this.list();

    return (
      recordings.find(
        (recording) =>
          (recording.captureState === "recording" || recording.captureState === "paused") &&
          Boolean(localRecordingAudioBlob(recording))
      ) ?? null
    );
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
      audioChunks: current.audioChunks.length > 0 ? current.audioChunks : [input.audioBlob],
      audioMimeType: input.audioMimeType,
      captureState: nextCaptureState(current.captureState, "stopped"),
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
    return this.save({
      ...current,
      captureState: nextCaptureState(current.captureState, "transcribing"),
      syncState: "transcribing",
      updatedAt: nowIso(),
      error: null
    });
  }

  async markTranscribed(id: string, transcript: string): Promise<LocalRecording> {
    const current = requireExisting(await this.get(id), id);
    return this.save({
      ...current,
      captureState: nextCaptureState(current.captureState, "transcribed"),
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
      captureState: current.captureState === "failed" ? "failed" : assertLocalRecordingTransition(current.captureState, "failed"),
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

export function localRecordingAudioBlob(recording: LocalRecording): Blob | null {
  if (recording.audioBlob) {
    return recording.audioBlob;
  }

  if (!recording.audioChunks.length || !recording.audioMimeType) {
    return null;
  }

  return new Blob(recording.audioChunks, { type: recording.audioMimeType });
}

export function localRecordingStatus(recording: LocalRecording): RecordingStatus {
  return recording.syncState === "transcribed" ? "transcribed" : "recorded";
}

function isDashboardVisibleRecording(recording: LocalRecording): boolean {
  return ["stopped", "transcribing", "transcribed", "failed"].includes(recording.captureState) && Boolean(localRecordingAudioBlob(recording));
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
  return sortByNewest(recordings)
    .filter(isDashboardVisibleRecording)
    .map((recording) => toLocalDashboardRecord(recording, now));
}
