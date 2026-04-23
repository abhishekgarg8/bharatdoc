import { verifyRequestUser } from "@/lib/server/auth";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { AppError } from "@/lib/server/errors";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
    const repository = createSupabaseOnboardingRepository(createSupabaseServerClient());
    const doctor = await repository.findDoctorByFirebaseUid(user.uid);

    if (!doctor) {
      throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
    }

    return Response.json({ doctor });
  } catch (error) {
    return errorResponse(error);
  }
}
