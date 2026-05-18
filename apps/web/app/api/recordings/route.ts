import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { errorResponse } from "@/lib/server/errors";
import {
  createRecordingMetadataForDoctor,
  listDashboardRecordingsForDoctor
} from "@/lib/server/recordings";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "10");
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const records = await listDashboardRecordingsForDoctor(user, repository, limit);

    return Response.json({ records });
  } catch (error) {
    return errorResponse(error, request);
  }
}

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = await request.json();
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const record = await createRecordingMetadataForDoctor(user, body, repository);

    return Response.json({ record }, { status: 201 });
  } catch (error) {
    return errorResponse(error, request);
  }
}
