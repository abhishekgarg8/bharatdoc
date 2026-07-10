import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { AppError } from "@/lib/server/errors";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabaseOnboardingRepository(
      createSupabaseServerClient(),
    );
    const doctor = await repository.findDoctorByAuthUid(user.uid);

    if (!doctor) {
      throw new AppError(
        404,
        "Doctor profile has not been created.",
        "PROFILE_NOT_FOUND",
      );
    }

    const clinic = doctor.clinic_id
      ? await repository.findClinicById(doctor.clinic_id)
      : null;
    return noStore(
      Response.json({
        doctor: {
          id: doctor.id,
          authUserId: doctor.firebase_uid,
          clinicId: doctor.clinic_id,
          role: doctor.role,
          accountStatus: doctor.account_status,
          name: doctor.name,
        },
        clinic: clinic ? { id: clinic.id, name: clinic.name } : null,
      }),
    );
  } catch (error) {
    return noStore(errorResponse(error, request));
  }
}
