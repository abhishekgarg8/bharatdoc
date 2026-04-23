import type { Doctor, Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AudioStorage, DoctorRepository, RecordingProcessingRepository } from "./types.js";

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
    async findByFirebaseUid(firebaseUid: string): Promise<Doctor | null> {
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
        .eq("firebase_uid", firebaseUid)
        .maybeSingle<DoctorRow>();

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
    }
  };
}

function audioExtension(file: Express.Multer.File): string {
  const originalExtension = file.originalname.split(".").pop()?.toLowerCase();

  if (originalExtension && /^[a-z0-9]+$/.test(originalExtension)) {
    return originalExtension;
  }

  if (file.mimetype === "audio/mp4") {
    return "m4a";
  }

  return "webm";
}

export function createSupabaseAudioStorage(supabase: SupabaseClient): AudioStorage {
  return {
    async uploadRecordingAudio(input): Promise<string> {
      const path = [
        input.clinicId,
        input.doctorId,
        `${input.recordingId}-${Date.now()}.${audioExtension(input.audio)}`
      ].join("/");
      const { error } = await supabase.storage.from("audio").upload(path, input.audio.buffer, {
        contentType: input.audio.mimetype || "application/octet-stream",
        upsert: true
      });

      if (error) {
        throw error;
      }

      return path;
    }
  };
}
