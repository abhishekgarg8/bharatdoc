import { verifyRequestUser } from "@/lib/server/auth";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { errorResponse } from "@/lib/server/errors";
import {
  getClinicAdminSnapshotForOwner,
  updateClinicProfileForOwner
} from "@/lib/server/clinic-admin";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const snapshot = await getClinicAdminSnapshotForOwner(user, repository);

    return Response.json(snapshot);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
    const body = await request.json();
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const clinic = await updateClinicProfileForOwner(user, body, repository);

    return Response.json({ clinic });
  } catch (error) {
    return errorResponse(error);
  }
}
