import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { getDoctorPreferencesBootstrapForUser, updateDoctorPreferencesForUser } from "@/lib/server/settings";
import { createServerTiming, jsonWithServerTiming } from "@/lib/server/server-timing";
import { createSupabaseSettingsRepository } from "@/lib/server/supabase-settings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const timing = createServerTiming();

  try {
    const user = await timing.measure("auth", () => verifyRequestUser(request, createSupabaseAuthVerifier()));
    const repository = createSupabaseSettingsRepository(createSupabaseServerClient());
    const bootstrap = await timing.measure("preferences", () => getDoctorPreferencesBootstrapForUser(user, repository));

    return jsonWithServerTiming(bootstrap, timing);
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
