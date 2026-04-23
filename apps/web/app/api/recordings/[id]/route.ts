import { verifyRequestUser } from "@/lib/server/auth";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { errorResponse } from "@/lib/server/errors";
import { getRecordingDetailForDoctor } from "@/lib/server/recordings";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await verifyRequestUser(request, createFirebaseAdminVerifier());
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const recording = await getRecordingDetailForDoctor(user, params.id, repository);

    return Response.json({ recording });
  } catch (error) {
    return errorResponse(error);
  }
}
