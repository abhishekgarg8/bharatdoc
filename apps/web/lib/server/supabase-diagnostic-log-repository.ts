import "server-only";
import type { Doctor } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DiagnosticLogListFilters,
  DiagnosticLogRepository,
  DiagnosticLogRow,
  DiagnosticLogView
} from "@/lib/server/diagnostic-logs";

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) {
    return 100;
  }

  return Math.min(Math.max(Math.floor(limit), 1), 500);
}

export function createSupabaseDiagnosticLogRepository(supabase: SupabaseClient): DiagnosticLogRepository {
  return {
    async findDoctorByAuthUid(authUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase.from("doctors").select("*").eq("firebase_uid", authUid).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Doctor | null;
    },

    async insertLogs(rows: DiagnosticLogRow[]): Promise<void> {
      const { error } = await supabase.from("diagnostic_logs").insert(rows);

      if (error) {
        throw error;
      }
    },

    async listLogsForClinic(clinicId: string, filters: DiagnosticLogListFilters): Promise<DiagnosticLogView[]> {
      let query = supabase
        .from("diagnostic_logs")
        .select(
          [
            "source",
            "level",
            "event",
            "doctor_id",
            "recording_id",
            "client_created_at",
            "created_at"
          ].join(",")
        )
        .eq("clinic_id", clinicId)
        .order("created_at", { ascending: false })
        .limit(clampLimit(filters.limit));

      if (filters.recordingId) {
        query = query.eq("recording_id", filters.recordingId);
      }

      if (filters.patientId) {
        query = query.eq("patient_id", filters.patientId);
      }

      if (filters.deviceId) {
        query = query.eq("device_id", filters.deviceId);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data ?? []) as unknown as DiagnosticLogView[];
    }
  };
}
