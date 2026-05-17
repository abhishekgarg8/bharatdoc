import { verifyRequestUser } from "@/lib/server/auth";
import { getSettingsBootstrapForUser } from "@/lib/server/clinic-admin";
import { errorResponse } from "@/lib/server/errors";
import { createServerTiming, jsonWithServerTiming } from "@/lib/server/server-timing";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { createSupabaseClinicAdminRepository } from "@/lib/server/supabase-clinic-admin-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const timing = createServerTiming();

  try {
    const user = await timing.measure("auth", () => verifyRequestUser(request, createSupabaseAuthVerifier()));
    const repository = createSupabaseClinicAdminRepository(createSupabaseServerClient());
    const snapshot = await timing.measure("settings_bootstrap", () => getSettingsBootstrapForUser(user, repository));

    return jsonWithServerTiming(snapshot, timing);
  } catch (error) {
    return errorResponse(error);
  }
}
