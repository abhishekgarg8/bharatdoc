import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { AppError, errorResponse } from "@/lib/server/errors";
import { processDeletionReceipt, toPublicDeletionReceipt } from "@/lib/server/phi-deletion";

export const dynamic = "force-dynamic";
interface Context { params: Promise<{ id: string }> }

async function authorizedReceipt(request: Request, id: string) {
  const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
  const supabase = createSupabaseServerClient();
  const doctor = await supabase.from("doctors").select("id").eq("firebase_uid", user.uid).maybeSingle<{ id: string }>();
  if (doctor.error) throw doctor.error;
  if (!doctor.data) throw new AppError(404, "Deletion receipt was not found.", "DELETION_RECEIPT_NOT_FOUND");
  const receipt = await supabase.rpc("get_deletion_receipt_for_doctor", { p_receipt_id: id, p_doctor_id: doctor.data.id });
  if (receipt.error) throw receipt.error;
  if (!receipt.data) throw new AppError(404, "Deletion receipt was not found.", "DELETION_RECEIPT_NOT_FOUND");
  return { supabase, receipt: toPublicDeletionReceipt(receipt.data) };
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { receipt } = await authorizedReceipt(request, id);
    return Response.json({ deletion: receipt });
  } catch (error) {
    return errorResponse(error, request);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { supabase, receipt } = await authorizedReceipt(request, id);
    const deletion = receipt.state === "completed" ? receipt : await processDeletionReceipt(supabase, receipt.id);
    return Response.json({ deletion }, { status: deletion.state === "completed" ? 200 : 202 });
  } catch (error) {
    return errorResponse(error, request);
  }
}
