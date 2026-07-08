import "server-only";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateRecordingRow, RecordingListItem, RecordingsRepository } from "@/lib/server/recordings";
import { patientIdSearchPattern } from "@/lib/server/patient-id-search";

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

function toDeletedRecordingListItem(row: Recording): RecordingListItem {
  return {
    ...row,
    doctor_name: null
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

    async findClinicById(clinicId: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("id", clinicId).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Clinic | null;
    },

    async countPendingJoinRequests(clinicId: string): Promise<number> {
      const { count, error } = await supabase
        .from("clinic_join_requests")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId)
        .eq("status", "pending");

      if (error) {
        throw error;
      }

      return count ?? 0;
    },

    async listRecentClinicRecordings(clinicId: string, limit: number): Promise<RecordingListItem[]> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*, doctors!inner(name)")
        .eq("clinic_id", clinicId)
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
        .ilike("patient_id", patientIdSearchPattern(patientId))
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
        if (error.code === "23505") {
          const { data: existing, error: existingError } = await supabase
            .from("recordings")
            .select("*, doctors!inner(name)")
            .eq("id", input.id)
            .maybeSingle();

          if (existingError) {
            throw existingError;
          }

          const existingRecording = existing as RecordingWithDoctorRow | null;

          if (existingRecording?.doctor_id === input.doctorId) {
            return toRecordingListItem(existingRecording);
          }
        }

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

    async findRecordingForDoctor(recordingId: string, doctorId: string): Promise<RecordingListItem | null> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*, doctors!inner(name)")
        .eq("id", recordingId)
        .eq("doctor_id", doctorId)
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
          status: "summary_ready",
          pdf_storage_path: null,
          pdf_generated_at: null,
          pdf_version: null
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .select("*, doctors!inner(name)")
        .single();

      if (error) {
        throw error;
      }

      return toRecordingListItem(data as RecordingWithDoctorRow);
    },

    async deleteRecordingForDoctor(recordingId: string, doctorId: string): Promise<RecordingListItem | null> {
      const { data, error } = await supabase
        .from("recordings")
        .delete()
        .eq("id", recordingId)
        .eq("doctor_id", doctorId)
        .select("*")
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data ? toDeletedRecordingListItem(data as Recording) : null;
    },

    async removeRecordingStorageObjects(input): Promise<void> {
      const removals: PromiseLike<unknown>[] = [];

      if (input.audioStoragePath) {
        removals.push(
          supabase.storage
            .from("audio")
            .remove([input.audioStoragePath])
            .then(({ error }) => {
              if (error) {
                throw error;
              }
            })
        );
      }

      if (input.pdfStoragePath) {
        removals.push(
          supabase.storage
            .from("pdfs")
            .remove([input.pdfStoragePath])
            .then(({ error }) => {
              if (error) {
                throw error;
              }
            })
        );
      }

      await Promise.all(removals);
    },

    async createPdfSignedUrl(path: string): Promise<string> {
      const { data, error } = await supabase.storage.from("pdfs").createSignedUrl(path, 30 * 60);

      if (error) {
        throw error;
      }

      return data.signedUrl;
    }
  };
}
