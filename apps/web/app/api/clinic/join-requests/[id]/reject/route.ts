import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { rejectJoinRequestForOwner } from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = (await request.json().catch(() => ({}))) as { reason?: string };
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const result = await rejectJoinRequestForOwner(user, id, body.reason ?? null, repository);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, request);
  }
}
