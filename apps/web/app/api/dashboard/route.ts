import { verifyRequestUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { getDashboardSnapshotForUser } from "@/lib/server/recordings";
import { createServerTiming, jsonWithServerTiming } from "@/lib/server/server-timing";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const timing = createServerTiming();

  try {
    const user = await timing.measure("auth", () => verifyRequestUser(request, createSupabaseAuthVerifier()));
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const snapshot = await timing.measure("dashboard", () => getDashboardSnapshotForUser(user, repository, limit));

    return jsonWithServerTiming(snapshot, timing);
  } catch (error) {
    return errorResponse(error);
  }
}
