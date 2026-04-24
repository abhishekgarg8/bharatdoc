import "server-only";
import type { Doctor, Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateRecordingRow, RecordingListItem, RecordingsRepository } from "@/lib/server/recordings";

interface RecordingWithDoctorRow extends Recording {
  doctors:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
}

function doctorNameFromRow(row: RecordingWithDoctorRow): string | null {
  if (!row.doctors) {
    return null;
  }

  return Array.isArray(row.doctors) ? row.doctors[0]?.name ?? null : row.doctors.name;
}

function toRecordingListItem(row: RecordingWithDoctorRow): RecordingListItem {
  const { doctors: _doctors, ...recording } = row;

  return {
    ...recording,
    doctor_name: doctorNameFromRow(row)
  };
}

export function createSupabaseRecordingsRepository(supabase: SupabaseClient): RecordingsRepository {
  return {
    async findDoctorByAuthUid(authUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase.from("doctors").select("*").eq("firebase_uid", authUid).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Doctor | null;
    },

    async listRecentRecordings(doctorId: string, limit: number): Promise<RecordingListItem[]> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*, doctors!inner(name)")
        .eq("doctor_id", doctorId)
        .order("recorded_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return ((data ?? []) as RecordingWithDoctorRow[]).map(toRecordingListItem);
    },

    async searchPatientRecordings(clinicId: string, patientId: string, limit: number): Promise<RecordingListItem[]> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*, doctors!inner(name)")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("recorded_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return ((data ?? []) as RecordingWithDoctorRow[]).map(toRecordingListItem);
    },

    async createRecording(input: CreateRecordingRow): Promise<RecordingListItem> {
      const { data, error } = await supabase
        .from("recordings")
        .insert({
          id: input.id,
          doctor_id: input.doctorId,
          clinic_id: input.clinicId,
          patient_id: input.patientId,
          label: input.label,
          duration_seconds: input.durationSeconds,
          status: "recorded",
          recorded_at: input.recordedAt
        })
        .select("*, doctors!inner(name)")
        .single();

      if (error) {
        throw error;
      }

      return toRecordingListItem(data as RecordingWithDoctorRow);
    },

    async findRecordingForClinic(recordingId: string, clinicId: string): Promise<RecordingListItem | null> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*, doctors!inner(name)")
        .eq("id", recordingId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? toRecordingListItem(data as RecordingWithDoctorRow) : null;
    },

    async updateRecordingSummary(input): Promise<RecordingListItem> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          summary: input.summary,
          status: input.status
        })
        .eq("id", input.recordingId)
        .eq("clinic_id", input.clinicId)
        .select("*, doctors!inner(name)")
        .single();

      if (error) {
        throw error;
      }

      return toRecordingListItem(data as RecordingWithDoctorRow);
    }
  };
}
