import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { AppError } from "@/lib/server/errors";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabaseOnboardingRepository(createSupabaseServerClient());
    const doctor = await repository.findDoctorByAuthUid(user.uid);

    if (!doctor) {
      throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
    }

    return Response.json({ doctor });
  } catch (error) {
    return errorResponse(error);
  }
}
