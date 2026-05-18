import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { getPendingApprovalStatusForUser } from "@/lib/server/pending-approval";
import { createSupabasePendingApprovalRepository } from "@/lib/server/supabase-pending-approval-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabasePendingApprovalRepository(createSupabaseServerClient());
    const status = await getPendingApprovalStatusForUser(user, repository);

    return Response.json(status);
  } catch (error) {
    return errorResponse(error, request);
  }
}
