import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { processDeletionReceipt, toPublicDeletionReceipt } from "@/lib/server/phi-deletion";
import { AppError, errorResponse } from "@/lib/server/errors";
import type { DeletionReceipt } from "@/lib/server/recordings";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const supabase = createSupabaseServerClient();
    const existing = await supabase.rpc("find_account_deletion", { p_auth_user_id: user.uid });
    if (existing.error) throw existing.error;
    let requestedData = existing.data;
    let requestedError: unknown = existing.error;
    if (!existing.data) {
      const { data: doctor, error: doctorError } = await supabase.from("doctors")
        .select("id").eq("firebase_uid", user.uid).maybeSingle<{ id: string }>();
      if (doctorError) throw doctorError;
      if (!doctor) throw new AppError(404, "Account was not found.", "ACCOUNT_NOT_FOUND");
      const requestResult = await supabase.rpc("request_account_deletion", { p_auth_user_id: user.uid, p_doctor_id: doctor.id });
      requestedData = requestResult.data;
      requestedError = requestResult.error;
    }
    if (requestedError) throw requestedError;
    if (!requestedData) throw new AppError(404, "Account was not found.", "ACCOUNT_NOT_FOUND");
    let receipt = await processDeletionReceipt(supabase, (requestedData as DeletionReceipt).id);
    if (receipt.error_code === "AUTH_DELETE_PENDING") {
      const claim = await supabase.rpc("claim_account_auth_deletion", { p_receipt_id: receipt.id });
      if (claim.error) throw claim.error;
      const authDeletion = (claim.data as Array<{ auth_user_id: string; lease_token: string }> | null)?.[0];
      if (authDeletion) {
        const authError = authDeletion.auth_user_id === user.uid
          ? (await supabase.auth.admin.deleteUser(user.uid)).error
          : new Error("Account deletion scope mismatch.");
        const effectiveError = authError && "status" in authError && authError.status === 404 ? null : authError;
        const completion = await supabase.rpc(
          effectiveError ? "release_account_auth_deletion" : "complete_account_auth_deletion",
          { p_receipt_id: receipt.id, p_lease_token: authDeletion.lease_token }
        );
        if (completion.error) throw completion.error;
        if (effectiveError) throw effectiveError;
        receipt = toPublicDeletionReceipt(completion.data);
      }
    }
    return Response.json({ deletion: receipt }, { status: receipt.state === "completed" ? 200 : 202 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("ACCOUNT_OWNER_TRANSFER_REQUIRED")) {
      return errorResponse(new AppError(409, "Transfer hospital ownership before deleting this account.", "ACCOUNT_OWNER_TRANSFER_REQUIRED"), request);
    }
    if (error instanceof Error && error.message.includes("RECORDING_PROCESSING_ACTIVE")) {
      return errorResponse(new AppError(409, "A consultation is still processing. Retry shortly.", "RECORDING_PROCESSING_ACTIVE"), request);
    }
    return errorResponse(error, request);
  }
}
