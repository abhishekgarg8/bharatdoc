import { extractBearerToken, verifyRequestUser } from "@/lib/server/auth";
import { getWebEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { saveRecordingSummaryForDoctor } from "@/lib/server/recordings";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";
import { proxySummaryRequest } from "@/lib/server/worker-summary-proxy";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    await verifyRequestUser(request, createSupabaseAuthVerifier());
    const idempotencyKey = request.headers.get("idempotency-key");
    const result = await proxySummaryRequest({
      recordingId: params.id,
      bearerToken,
      workerBaseUrl: getWebEnv().RAILWAY_WORKER_URL,
      ...(idempotencyKey ? { idempotencyKey } : {})
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, request);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = (await request.json()) as { summary?: string };
    const repository = createSupabaseRecordingsRepository(createSupabaseServerClient());
    const recording = await saveRecordingSummaryForDoctor(user, params.id, body.summary, repository);

    return Response.json({ recording });
  } catch (error) {
    return errorResponse(error, request);
  }
}
