import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { listPendingApprovalsForOwner } from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const pending = await listPendingApprovalsForOwner(user, repository);

    return Response.json({ pending });
  } catch (error) {
    return errorResponse(error);
  }
}
