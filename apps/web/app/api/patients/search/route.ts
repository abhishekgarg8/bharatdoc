import { z } from "zod";
import { verifyRequestUser } from "@/lib/server/auth";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { AppError, errorResponse, toAppError } from "@/lib/server/errors";
import { searchPatientRecordingsForClinic } from "@/lib/server/recordings";
import { createSupabaseRecordingsRepository } from "@/lib/server/supabase-recordings-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

const SearchBodySchema = z
  .object({
    patient_id: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9 _-]+$/, "Patient ID format is invalid."),
    limit: z.number().int().min(1).max(50).default(25),
  })
  .strict();
const MAX_SEARCH_BODY_BYTES = 4096;
const privateHeaders = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Authorization",
};

async function searchBody(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new AppError(
      415,
      "Patient search requires JSON.",
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_SEARCH_BODY_BYTES
  ) {
    throw new AppError(
      413,
      "Search request is too large.",
      "PAYLOAD_TOO_LARGE",
    );
  }
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_SEARCH_BODY_BYTES) {
        await reader.cancel();
        throw new AppError(
          413,
          "Search request is too large.",
          "PAYLOAD_TOO_LARGE",
        );
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  }
  try {
    return SearchBodySchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new AppError(
        400,
        "Request body must be valid JSON.",
        "VALIDATION_ERROR",
      );
    throw error;
  }
}

export async function GET() {
  return Response.json(
    {
      error: {
        code: "METHOD_NOT_ALLOWED",
        message: "Patient search requires POST.",
      },
    },
    { status: 405, headers: { ...privateHeaders, Allow: "POST" } },
  );
}

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const body = await searchBody(request);
    const repository = createSupabaseRecordingsRepository(
      createSupabaseServerClient(),
    );
    const records = await searchPatientRecordingsForClinic(
      user,
      body.patient_id,
      repository,
      body.limit,
    );

    return Response.json({ records }, { headers: privateHeaders });
  } catch (error) {
    const response = errorResponse(
      toAppError(error).status >= 500
        ? new AppError(500, "Internal server error.", "INTERNAL_ERROR")
        : error,
      request,
    );
    for (const [name, value] of Object.entries(privateHeaders))
      response.headers.set(name, value);
    return response;
  }
}
