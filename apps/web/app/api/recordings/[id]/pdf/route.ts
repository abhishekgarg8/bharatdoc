import { extractBearerToken, verifyRequestUser } from "@/lib/server/auth";
import { getWebEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/errors";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { proxyPdfRequest } from "@/lib/server/worker-pdf-proxy";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    await verifyRequestUser(request, createFirebaseAdminVerifier());
    const result = await proxyPdfRequest({
      recordingId: params.id,
      bearerToken,
      workerBaseUrl: getWebEnv().RAILWAY_WORKER_URL
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
