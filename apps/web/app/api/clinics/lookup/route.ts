import { lookupClinicByCode } from "@/lib/server/onboarding";
import { errorResponse, toAppError } from "@/lib/server/errors";
import { assertClinicLookupAllowed, recordClinicLookupMiss } from "@/lib/server/clinic-lookup-guard";
import { createSupabaseOnboardingRepository } from "@/lib/server/supabase-onboarding-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertClinicLookupAllowed(request);

    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "";
    const repository = createSupabaseOnboardingRepository(createSupabaseServerClient());
    const result = await lookupClinicByCode(code, repository);

    return Response.json(result);
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "CLINIC_NOT_FOUND") {
      recordClinicLookupMiss(request);
    }

    return errorResponse(error, request);
  }
}
