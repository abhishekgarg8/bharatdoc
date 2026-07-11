import { createSupabaseServerClient } from "@/lib/server/supabase";
import { processDeletionReceiptBatch, processProcessingArtifactCleanup } from "@/lib/server/phi-deletion";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const supabase = createSupabaseServerClient();
    const reconciliation = await supabase.rpc("reconcile_retention_and_orphans");
    if (reconciliation.error) throw reconciliation.error;
    const { data: receipts, error } = await supabase.rpc("list_deletion_receipts_for_processing", { p_limit: 10 });
    if (error) throw error;
    let completed = 0;
    const deadline = Date.now() + 20_000;
    let artifactsDeleted = 0;
    let artifactFailures = 0;
    for (let batch = 0; batch < 5 && Date.now() < deadline; batch += 1) {
      const artifacts = await processProcessingArtifactCleanup(supabase);
      artifactsDeleted += artifacts.deleted;
      artifactFailures += artifacts.failed;
      if (artifacts.claimed < 20 || artifacts.failed > 0) break;
    }
    for (const receipt of receipts ?? []) {
      for (let batch = 0; batch < 5 && Date.now() < deadline; batch += 1) {
        const result = await processDeletionReceiptBatch(supabase, receipt.id);
        if (result.receipt.state === "completed") {
          completed += 1;
          break;
        }
        if (result.failed > 0 || result.claimed < 20) break;
      }
    }
    let authCompleted = 0;
    let authFailures = 0;
    for (let count = 0; count < 5 && Date.now() < deadline; count += 1) {
      const authClaim = await supabase.rpc("claim_account_auth_deletion", { p_receipt_id: null });
      if (authClaim.error) throw authClaim.error;
      const authDeletion = (authClaim.data as Array<{ receipt_id: string; auth_user_id: string; lease_token: string }> | null)?.[0];
      if (!authDeletion) break;
      const authError = (await supabase.auth.admin.deleteUser(authDeletion.auth_user_id)).error;
      const effectiveError = authError && authError.status === 404 ? null : authError;
      const completion = await supabase.rpc(
        effectiveError ? "release_account_auth_deletion" : "complete_account_auth_deletion",
        { p_receipt_id: authDeletion.receipt_id, p_lease_token: authDeletion.lease_token }
      );
      if (completion.error) throw completion.error;
      if (effectiveError) {
        authFailures += 1;
        break;
      }
      authCompleted += 1;
    }
    const backlog = await supabase.rpc("list_deletion_receipts_for_processing", { p_limit: 50 });
    if (backlog.error) throw backlog.error;
    return Response.json({ ok: true, receipts_completed: completed, auth_completed: authCompleted,
      auth_failures: authFailures,
      backlog_count: (backlog.data ?? []).length, artifacts_deleted: artifactsDeleted,
      artifact_failures: artifactFailures, reconciliation: reconciliation.data });
  } catch {
    return Response.json({ error: "Retention finalizer failed." }, { status: 500 });
  }
}
