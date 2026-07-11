import { describe, expect, it, vi } from "vitest";
import { processDeletionReceipt, processDeletionReceiptBatch, processProcessingArtifactCleanup, toPublicDeletionReceipt } from "@/lib/server/phi-deletion";

function client(options: { removeFails?: boolean; finalState?: "failed" | "completed" } = {}) {
  const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
    if (name === "claim_deletion_objects") return { data: [{
      id: "object-1", receipt_id: "receipt-1", bucket: "audio", storage_path: "private/path", lease_token: "lease-1"
    }], error: null };
    if (name === "finalize_deletion_receipt") return { data: {
      id: input.p_receipt_id, state: options.finalState ?? (options.removeFails ? "failed" : "completed"),
      object_count: 1, deleted_object_count: options.removeFails ? 0 : 1, error_code: options.removeFails ? "OBJECT_CLEANUP_INCOMPLETE" : null,
      completed_at: options.removeFails ? null : "2026-07-11T00:00:00.000Z", subject_hash: "must-not-leak", actor_hash: "must-not-leak"
    }, error: null };
    return { data: null, error: null };
  });
  const remove = vi.fn(async () => ({ error: options.removeFails ? new Error("storage down") : null }));
  return { rpc, remove, value: { rpc, storage: { from: vi.fn(() => ({ remove })) } } };
}

describe("PHI deletion processor", () => {
  it("claims one bounded receipt-scoped batch and returns only public receipt fields", async () => {
    const fake = client();
    const result = await processDeletionReceipt(fake.value as never, "receipt-1");
    expect(fake.rpc).toHaveBeenCalledWith("claim_deletion_objects", { p_receipt_id: "receipt-1", p_limit: 20 });
    expect(fake.rpc).toHaveBeenCalledWith("complete_deletion_object", { p_id: "object-1", p_lease_token: "lease-1" });
    expect(result).toEqual({ id: "receipt-1", state: "completed", object_count: 1, deleted_object_count: 1,
      error_code: null, completed_at: "2026-07-11T00:00:00.000Z" });
    expect(result).not.toHaveProperty("subject_hash");
  });

  it("releases a failed object exactly once and leaves an observable retry receipt", async () => {
    const fake = client({ removeFails: true });
    await expect(processDeletionReceipt(fake.value as never, "receipt-1")).resolves.toMatchObject({ state: "failed" });
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("release_deletion_object", {
      p_id: "object-1", p_lease_token: "lease-1", p_error_code: "STORAGE_DELETE_FAILED"
    });
  });

  it("reports internal batch progress without adding fields to the public receipt", async () => {
    const fake = client({ removeFails: true });
    await expect(processDeletionReceiptBatch(fake.value as never, "receipt-1")).resolves.toMatchObject({
      claimed: 1,
      failed: 1,
      receipt: { id: "receipt-1", state: "failed" }
    });
  });

  it("maps raw RPC values without serializing subject or actor hashes", () => {
    expect(toPublicDeletionReceipt({ id: "r", state: "completed", subject_hash: "secret", actor_hash: "secret" }))
      .toEqual({ id: "r", state: "completed", object_count: 0, deleted_object_count: 0, error_code: null, completed_at: null });
  });

  it("reuses the processing-artifact lease and releases failed storage cleanup", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_processing_artifact_cleanup") return { data: [
        { kind: "audio", storage_path: "audio-ok", cleanup_token: "lease-a" },
        { kind: "pdf", storage_path: "pdf-retry", cleanup_token: "lease-p" }
      ], error: null };
      return { data: null, error: null };
    });
    const remove = vi.fn(async (paths: string[]) => ({ error: paths[0] === "pdf-retry" ? new Error("storage down") : null }));
    const supabase = { rpc, storage: { from: vi.fn(() => ({ remove })) } } as never;

    await expect(processProcessingArtifactCleanup(supabase)).resolves.toEqual({ claimed: 2, deleted: 1, failed: 1 });
    expect(rpc).toHaveBeenCalledWith("claim_processing_artifact_cleanup", { p_limit: 20, p_kinds: ["audio", "pdf"] });
    expect(rpc).toHaveBeenCalledWith("complete_processing_artifact_cleanup", {
      p_storage_path: "audio-ok", p_cleanup_token: "lease-a"
    });
    expect(rpc).toHaveBeenCalledWith("release_processing_artifact_cleanup", {
      p_storage_path: "pdf-retry", p_cleanup_token: "lease-p"
    });
  });

  it("completes the lease when storage reports an already-absent object as removed", async () => {
    const rpc = vi.fn(async (name: string) => name === "claim_processing_artifact_cleanup"
      ? { data: [{ kind: "pdf", storage_path: "already-absent.pdf", cleanup_token: "lease" }], error: null }
      : { data: null, error: null });
    const remove = vi.fn(async () => ({ error: null }));
    await expect(processProcessingArtifactCleanup({ rpc, storage: { from: () => ({ remove }) } } as never))
      .resolves.toEqual({ claimed: 1, deleted: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith("complete_processing_artifact_cleanup", {
      p_storage_path: "already-absent.pdf", p_cleanup_token: "lease"
    });
  });
});
