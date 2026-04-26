import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { createServerTiming, jsonWithServerTiming } from "@/lib/server/server-timing";
import {
  getClinicAdminSnapshotForOwner,
  updateClinicProfileForOwner
} from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";

export async function GET(request: Request) {
  const timing = createServerTiming();

  try {
    const user = await timing.measure("auth", () => verifyRequestUser(request, createSupabaseAuthVerifier()));
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const snapshot = await timing.measure("clinic_admin", () => getClinicAdminSnapshotForOwner(user, repository));

    return jsonWithServerTiming(snapshot, timing);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = await request.json();
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const clinic = await updateClinicProfileForOwner(user, body, repository);

    return Response.json({ clinic });
  } catch (error) {
    return errorResponse(error);
  }
}
