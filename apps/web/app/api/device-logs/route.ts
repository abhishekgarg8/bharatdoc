import { verifyRequestUser } from "@/lib/server/auth";
import { ingestDeviceLogsForUser, listDiagnosticLogsForUser } from "@/lib/server/diagnostic-logs";
import { errorResponse } from "@/lib/server/errors";
import { createSupabaseAuthVerifier } from "@/lib/server/supabase-auth";
import { createSupabaseDiagnosticLogRepository } from "@/lib/server/supabase-diagnostic-log-repository";
import { createSupabaseServerClient } from "@/lib/server/supabase";

export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const repository = createSupabaseDiagnosticLogRepository(createSupabaseServerClient());
    const result = await ingestDeviceLogsForUser(user, await request.json(), repository);

    return Response.json(result, { status: 202 });
  } catch (error) {
    return errorResponse(error, request);
  }
}

export async function GET(request: Request) {
  try {
    const user = await verifyRequestUser(request, createSupabaseAuthVerifier());
    const url = new URL(request.url);
    const repository = createSupabaseDiagnosticLogRepository(createSupabaseServerClient());
    const logs = await listDiagnosticLogsForUser(
      user,
      {
        recordingId: url.searchParams.get("recording_id"),
        patientId: url.searchParams.get("patient_id"),
        deviceId: url.searchParams.get("device_id"),
        limit: Number(url.searchParams.get("limit") ?? "100")
      },
      repository
    );

    return Response.json({ logs });
  } catch (error) {
    return errorResponse(error, request);
  }
}
