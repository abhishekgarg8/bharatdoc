import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeletionReceipt } from "@/lib/server/recordings";

export function toPublicDeletionReceipt(value: unknown): DeletionReceipt {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    state: row.state as DeletionReceipt["state"],
    object_count: Number(row.object_count ?? 0),
    deleted_object_count: Number(row.deleted_object_count ?? 0),
    error_code: typeof row.error_code === "string" ? row.error_code : null,
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null
  };
}

export async function processDeletionReceiptBatch(
  supabase: SupabaseClient,
  receiptId: string,
  limit = 20
): Promise<{ receipt: DeletionReceipt; claimed: number; failed: number }> {
  const { data: claimed, error: claimError } = await supabase.rpc("claim_deletion_objects", {
    p_receipt_id: receiptId,
    p_limit: limit
  });
  if (claimError) throw claimError;
  const objects = (claimed ?? []) as Array<{
    id: string; bucket: "audio" | "pdfs" | "assets"; storage_path: string; lease_token: string;
  }>;
  let failed = 0;
  await Promise.all(objects.map(async (object) => {
    const { error: removeError } = await supabase.storage.from(object.bucket).remove([object.storage_path]);
    const { error: stateError } = await supabase.rpc(
      removeError ? "release_deletion_object" : "complete_deletion_object",
      removeError
        ? { p_id: object.id, p_lease_token: object.lease_token, p_error_code: "STORAGE_DELETE_FAILED" }
        : { p_id: object.id, p_lease_token: object.lease_token }
    );
    if (stateError) throw stateError;
    if (removeError) failed += 1;
  }));
  const { data, error } = await supabase.rpc("finalize_deletion_receipt", { p_receipt_id: receiptId });
  if (error) throw error;
  return { receipt: toPublicDeletionReceipt(data), claimed: objects.length, failed };
}

export async function processDeletionReceipt(
  supabase: SupabaseClient,
  receiptId: string,
  limit = 20
): Promise<DeletionReceipt> {
  return (await processDeletionReceiptBatch(supabase, receiptId, limit)).receipt;
}

export async function processProcessingArtifactCleanup(supabase: SupabaseClient, limit = 20) {
  const { data, error } = await supabase.rpc("claim_processing_artifact_cleanup", {
    p_limit: limit,
    p_kinds: ["audio", "pdf"]
  });
  if (error) throw error;
  const artifacts = (data ?? []) as Array<{
    kind: "audio" | "pdf"; storage_path: string; cleanup_token: string;
  }>;
  let deleted = 0;
  await Promise.all(artifacts.map(async (artifact) => {
    const bucket = artifact.kind === "audio" ? "audio" : "pdfs";
    const removal = await supabase.storage.from(bucket).remove([artifact.storage_path]);
    const completion = await supabase.rpc(
      removal.error ? "release_processing_artifact_cleanup" : "complete_processing_artifact_cleanup",
      { p_storage_path: artifact.storage_path, p_cleanup_token: artifact.cleanup_token }
    );
    if (completion.error) throw completion.error;
    if (!removal.error) deleted += 1;
  }));
  return { claimed: artifacts.length, deleted, failed: artifacts.length - deleted };
}
