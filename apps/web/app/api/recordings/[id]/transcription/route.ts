import { extractBearerToken, verifyRequestUser } from "@/lib/server/auth";
import { getWebEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { proxyTranscriptionRequest } from "@/lib/server/worker-transcription-proxy";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const bearerToken = extractBearerToken(request.headers.get("authorization"));
    await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = await request.formData();
    const audio = body.get("audio");

    if (!(audio instanceof Blob)) {
      return Response.json(
        {
          error: {
            code: "AUDIO_REQUIRED",
            message: "Audio file is required."
          }
        },
        { status: 400 }
      );
    }

    const result = await proxyTranscriptionRequest({
      recordingId: params.id,
      bearerToken,
      workerBaseUrl: getWebEnv().RAILWAY_WORKER_URL,
      audio,
      filename: audio instanceof File ? audio.name : "recording.webm"
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
