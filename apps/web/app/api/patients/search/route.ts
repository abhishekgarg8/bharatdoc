import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { searchPatientRecordingsForClinic } from "@/lib/server/recordings";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const url = new URL(request.url);
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const records = await searchPatientRecordingsForClinic(
      user,
      url.searchParams.get("patient_id"),
      repository,
      Number(url.searchParams.get("limit") ?? "25")
    );

    return Response.json({ records });
  } catch (error) {
    return errorResponse(error, request);
  }
}
