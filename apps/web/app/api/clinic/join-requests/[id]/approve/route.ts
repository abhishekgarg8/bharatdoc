import { verifyRequestUser } from "@/lib/server/auth";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { errorResponse } from "@/lib/server/errors";
import { approveJoinRequestForOwner } from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const result = await approveJoinRequestForOwner(user, params.id, repository);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
