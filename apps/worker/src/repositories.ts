import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudioStorage,
  ClinicRepository,
  DoctorRepository,
  PdfStorage,
  RecordingProcessingRepository
} from "./types.js";

interface DoctorRow {
  id: string;
  firebase_uid: string;
  clinic_id: string | null;
  role: "owner" | "doctor";
  account_status: "pending_approval" | "active" | "rejected";
  name: string;
  specialization: string;
  medical_reg_no: string | null;
  phone: string;
  profile_photo_path: string | null;
  custom_prompt: string | null;
  transcription_lang: "auto" | "hi" | "en" | "hien";
  created_at: string;
}

export function createDoctorRepository(supabase: SupabaseClient): DoctorRepository {
  return {
    async findByAuthUid(authUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase
        .from("doctors")
        .select(
          [
            "id",
            "firebase_uid",
            "clinic_id",
            "role",
            "account_status",
            "name",
            "specialization",
            "medical_reg_no",
            "phone",
            "profile_photo_path",
            "custom_prompt",
            "transcription_lang",
            "created_at"
          ].join(",")
        )
        .eq("firebase_uid", authUid)
        .maybeSingle<DoctorRow>();

      if (error) {
        throw error;
      }

      return data;
    }
  };
}

export function createClinicRepository(supabase: SupabaseClient): ClinicRepository {
  return {
    async findClinicById(clinicId: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("id", clinicId).maybeSingle<Clinic>();

      if (error) {
        throw error;
      }

      return data;
    }
  };
}

export function createRecordingProcessingRepository(supabase: SupabaseClient): RecordingProcessingRepository {
  return {
    async findRecordingForDoctor(recordingId: string, doctorId: string): Promise<Recording | null> {
      const { data, error } = await supabase
        .from("recordings")
        .select("*")
        .eq("id", recordingId)
        .eq("doctor_id", doctorId)
        .maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      return data;
    },

    async markRecordingTranscribed(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          audio_storage_path: input.audioStoragePath,
          transcript: input.transcript,
          status: "transcribed"
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .select("*")
        .single<Recording>();

      if (error) {
        throw error;
      }

      return data;
    },

    async markRecordingSummarized(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          summary: input.summary,
          status: input.status
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .select("*")
        .single<Recording>();

      if (error) {
        throw error;
      }

      return data;
    },

    async markRecordingPdfSaved(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          pdf_storage_path: input.pdfStoragePath,
          status: "pdf_saved"
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .select("*")
        .single<Recording>();

      if (error) {
        throw error;
      }

      return data;
    }
  };
}

export function createSupabaseAudioStorage(supabase: SupabaseClient): AudioStorage {
  return {
    async uploadRecordingAudio(input): Promise<string> {
      const extension = input.mimeType.includes("mp4") ? "m4a" : input.mimeType.includes("wav") ? "wav" : "webm";
      const path = [
        input.clinicId,
        input.doctorId,
        `${input.recordingId}-${Date.now()}.${extension}`
      ].join("/");
      const { error } = await supabase.storage.from("audio").upload(path, input.audio, {
        contentType: input.mimeType,
        upsert: true
      });

      if (error) {
        throw error;
      }

      return path;
    }
  };
}

export function createSupabasePdfStorage(supabase: SupabaseClient): PdfStorage {
  return {
    async uploadRecordingPdf(input): Promise<string> {
      const path = [
        input.clinicId,
        input.doctorId,
        `${input.recordingId}-${Date.now()}.pdf`
      ].join("/");
      const { error } = await supabase.storage.from("pdfs").upload(path, input.pdf, {
        contentType: "application/pdf",
        upsert: true
      });

      if (error) {
        throw error;
      }

      return path;
    },

    async createSignedUrl(path: string): Promise<string> {
      const { data, error } = await supabase.storage.from("pdfs").createSignedUrl(path, 30 * 60);

      if (error) {
        throw error;
      }

      return data.signedUrl;
    }
  };
}
