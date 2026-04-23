import { verifyRequestUser } from "@/lib/server/auth";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { errorResponse } from "@/lib/server/errors";
import { listPendingApprovalsForOwner } from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const pending = await listPendingApprovalsForOwner(user, repository);

    return Response.json({ pending });
  } catch (error) {
    return errorResponse(error);
  }
}
