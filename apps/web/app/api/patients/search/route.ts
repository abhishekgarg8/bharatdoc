import { verifyRequestUser } from "@/lib/server/auth";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { errorResponse } from "@/lib/server/errors";
import { searchPatientRecordingsForClinic } from "@/lib/server/recordings";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
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
    return errorResponse(error);
  }
}
