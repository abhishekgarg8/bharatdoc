import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { getDoctorPreferencesForUser, updateDoctorPreferencesForUser } from "@/lib/server/settings";
import { createSupabaseSettingsRepository } from "@/lib/server/supabase-settings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabaseSettingsRepository(createSupabaseServerClient());
    const preferences = await getDoctorPreferencesForUser(user, repository);

    return Response.json({ preferences });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = await request.json();
    const repository = createSupabaseSettingsRepository(createSupabaseServerClient());
    const preferences = await updateDoctorPreferencesForUser(user, body, repository);

    return Response.json({ preferences });
  } catch (error) {
    return errorResponse(error);
  }
}
