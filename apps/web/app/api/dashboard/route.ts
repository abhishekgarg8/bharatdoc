import { verifyRequestUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { getDashboardSnapshotForUser } from "@/lib/server/recordings";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const snapshot = await getDashboardSnapshotForUser(user, repository, limit);

    return Response.json(snapshot);
  } catch (error) {
    return errorResponse(error);
  }
}
