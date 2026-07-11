import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { approveJoinRequestForOwner } from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const result = await approveJoinRequestForOwner(user, id, repository);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, request);
  }
}
