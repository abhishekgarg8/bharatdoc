import { describe, expect, it, vi } from "vitest";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createMemoryLocalRecordingRepository, type LocalRecording } from "@/lib/client/local-recordings";

describe("complete consultation deletion lifecycle", () => {
  it("removes database PHI, every manifested object, local IndexedDB-equivalent data, and diagnostic ties", async () => {
    const recordingId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const doctorId = "11111111-1111-4111-8111-111111111111";
    const database = {
      recordings: [recordingId], attempts: [recordingId], logs: [recordingId], jobs: [recordingId],
      chunks: [recordingId], artifacts: [recordingId]
    };
    const storage = {
      audio: new Set(["current.webm", "chunk-0.webm", "attempt.webm", "superseded.webm"]),
      pdfs: new Set(["current.pdf", "superseded.pdf"]), assets: new Set<string>()
    };
    const manifest = [
      ["audio", "current.webm"], ["audio", "chunk-0.webm"], ["audio", "attempt.webm"],
      ["audio", "superseded.webm"], ["pdfs", "current.pdf"], ["pdfs", "superseded.pdf"]
    ] as const;
    const queue = manifest.map(([bucket, path], index) => ({
      id: `object-${index}`, receipt_id: "receipt-1", bucket, storage_path: path, lease_token: `lease-${index}`, deleted: false
    }));
    const rpc = vi.fn(async (name: string) => {
      if (name === "request_recording_deletion") {
        for (const values of Object.values(database)) values.splice(0);
        return { data: { id: "receipt-1", state: "queued", object_count: queue.length }, error: null };
      }
      if (name === "claim_deletion_objects") return { data: queue.filter((item) => !item.deleted), error: null };
      if (name === "finalize_deletion_receipt") return { data: {
        id: "receipt-1", state: queue.every((item) => item.deleted) ? "completed" : "failed",
        object_count: queue.length, deleted_object_count: queue.filter((item) => item.deleted).length,
        error_code: null, completed_at: "2026-07-11T00:00:00.000Z"
      }, error: null };
      return { data: null, error: null };
    });
    const supabase = {
      rpc: vi.fn(async (name: string, input: Record<string, string>) => {
        if (name === "complete_deletion_object") {
          const item = queue.find((candidate) => candidate.id === input.p_id)!;
          item.deleted = true;
          return { data: null, error: null };
        }
        return rpc(name);
      }),
      storage: { from: vi.fn((bucket: keyof typeof storage) => ({
        remove: vi.fn(async ([path]: string[]) => {
          storage[bucket].delete(path!);
          return { error: null };
        })
      })) }
    };
    const local: LocalRecording = {
      id: "local-1", authUserId: "auth-1", doctorId, clinicId: "clinic-1", patientId: "P-SECRET", label: null,
      durationSeconds: 10, recordedAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z",
      audioBlob: new Blob(["audio"]), audioChunks: [], audioMimeType: "audio/webm", captureState: "stopped",
      syncState: "synced", serverRecordingId: recordingId, transcript: null, error: null
    };
    const localRepository = createMemoryLocalRecordingRepository([local]);

    const receipt = await createSupabaseRecordingsRepository(supabase as never).deleteRecordingForDoctor(recordingId, doctorId);
    await localRepository.remove(local.id);

    expect(receipt).toMatchObject({ state: "completed", object_count: 6, deleted_object_count: 6 });
    expect(Object.values(database).every((values) => values.length === 0)).toBe(true);
    expect([...storage.audio, ...storage.pdfs]).toEqual([]);
    await expect(localRepository.list()).resolves.toEqual([]);
  });
});
