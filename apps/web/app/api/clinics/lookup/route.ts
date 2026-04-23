import { lookupClinicByCode } from "@/lib/server/onboarding";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const repository = createSupabaseOnboardingRepository(createSupabaseServerClient());
    const result = await lookupClinicByCode(code, repository);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
