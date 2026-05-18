import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { registerDoctorAccount } from "@/lib/server/onboarding";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = await request.json();
    const repository = createSupabaseOnboardingRepository(createSupabaseServerClient());
    const result = await registerDoctorAccount(body, user, repository);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, request);
  }
}
