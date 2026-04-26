import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import { getRecordingDetailBootstrapForDoctor } from "@/lib/server/recordings";
import { createServerTiming, jsonWithServerTiming } from "@/lib/server/server-timing";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  const timing = createServerTiming();

  try {
    const user = await timing.measure("auth", () => verifyRequestUser(request, createSupabaseAuthVerifier()));
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const bootstrap = await timing.measure("recording_detail", () =>
      getRecordingDetailBootstrapForDoctor(user, params.id, repository)
    );

    return jsonWithServerTiming(bootstrap, timing);
  } catch (error) {
    return errorResponse(error);
  }
}
