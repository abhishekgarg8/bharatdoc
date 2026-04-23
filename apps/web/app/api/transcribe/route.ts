import { verifyRequestUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { createFirebaseAdminVerifier } from "@/lib/server/firebase-admin";
import { getWebEnv } from "@/lib/server/env";
import { proxyTranscriptionRequest } from "@/lib/server/worker-proxy";

export async function POST(request: Request) {
  try {
    await verifyRequestUser(request, createFirebaseAdminVerifier());
    const result = await proxyTranscriptionRequest(request, {
      workerBaseUrl: getWebEnv().RAILWAY_WORKER_URL
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
