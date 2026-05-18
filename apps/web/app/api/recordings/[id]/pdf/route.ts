import { extractBearerToken, verifyRequestUser } from "@/lib/server/auth";
import { getWebEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { proxyPdfRequest } from "@/lib/server/worker-pdf-proxy";

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
    const result = await proxyPdfRequest({
      recordingId: params.id,
      bearerToken,
      workerBaseUrl: getWebEnv().RAILWAY_WORKER_URL
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, request);
  }
}
