import "server-only";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateRecordingRow, RecordingListItem, RecordingsRepository } from "@/lib/server/recordings";
import { patientIdSearchPattern } from "@/lib/server/patient-id-search";
import { AppError } from "@/lib/server/errors";

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
      const { data, error } = await supabase.rpc("save_recording_summary_with_processing_lock", {
        p_recording_id: input.recordingId,
        p_doctor_id: input.doctorId,
        p_expected_transcript: input.expectedTranscript,
        p_summary: input.summary
      });

      if (error) {
        if (error.message?.includes("PROCESSING_RECORDING_BUSY")) {
          throw new AppError(409, "This recording is already being processed.", "PROCESSING_RECORDING_BUSY");
        }
        if (error.message?.includes("PROCESSING_INPUT_CHANGED")) {
          throw new AppError(409, "Transcript changed while saving the summary.", "PROCESSING_INPUT_CHANGED");
        }
        throw error;
      }
      const result = data as { recording: Recording; superseded_pdf_path: string | null };
      if (result.superseded_pdf_path) {
        const { data: candidates, error: claimError } = await supabase.rpc("claim_processing_artifact_cleanup", {
          p_limit: 5, p_kinds: ["pdf"]
        });
        for (const candidate of (claimError ? [] : candidates ?? []) as Array<{ storage_path: string; cleanup_token: string }>) {
          const { error: deleteError } = await supabase.storage.from("pdfs").remove([candidate.storage_path]);
          const { error: cleanupError } = await supabase.rpc(
            deleteError ? "release_processing_artifact_cleanup" : "complete_processing_artifact_cleanup", {
            p_storage_path: candidate.storage_path,
            p_cleanup_token: candidate.cleanup_token
          });
          if (cleanupError) break; // The cleanup lease expires and is safely reclaimed later.
        }
      }
      return { ...result.recording, doctor_name: null };
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
