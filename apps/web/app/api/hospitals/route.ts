import { listHospitalsForOnboarding } from "@/lib/server/onboarding";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";

export async function GET() {
  try {
    const repository = createSupabaseOnboardingRepository(createSupabaseServerClient());
    const hospitals = await listHospitalsForOnboarding(repository);

    return Response.json({ hospitals });
  } catch (error) {
    return errorResponse(error);
  }
}
