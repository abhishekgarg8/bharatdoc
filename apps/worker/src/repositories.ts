import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AudioStorage,
  ClinicRepository,
  DoctorRepository,
  PdfStorage,
  RecordingProcessingRepository,
  TranscriptionAttemptRepository
} from "./types.js";
import { HttpError } from "./http-errors.js";

interface DoctorRow {
  id: string;
  firebase_uid: string;
  clinic_id: string | null;
  role: "owner" | "doctor";
  account_status: "pending_approval" | "active" | "rejected";
  name: string;
  specialization: string;
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

    async findLatestRecordingAudioPath(recordingId: string, doctorId: string): Promise<string | null> {
      const { data: recording, error: recordingError } = await supabase
        .from("recordings")
        .select("audio_storage_path")
        .eq("id", recordingId)
        .eq("doctor_id", doctorId)
        .maybeSingle<{ audio_storage_path: string | null }>();

      if (recordingError) {
        throw recordingError;
      }

      if (recording?.audio_storage_path) {
        return recording.audio_storage_path;
      }

      const { data: attempt, error: attemptError } = await supabase
        .from("transcription_attempts")
        .select("audio_storage_path")
        .eq("recording_id", recordingId)
        .eq("doctor_id", doctorId)
        .not("audio_storage_path", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ audio_storage_path: string | null }>();

      if (attemptError) {
        throw attemptError;
      }

      return attempt?.audio_storage_path ?? null;
    },

    async markRecordingTranscribed(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          audio_storage_path: input.audioStoragePath,
          transcript: input.transcript,
          summary: null,
          pdf_storage_path: null,
          status: "transcribed"
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .eq("status", "recorded")
        .select("*")
        .maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new HttpError(
          409,
          "Recording has already been transcribed or finalized.",
          "RECORDING_NOT_TRANSCRIBABLE"
        );
      }

      return data;
    },

    async markRecordingAudioUploaded(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          audio_storage_path: input.audioStoragePath
        })
        .eq("id", input.recordingId)
        .eq("doctor_id", input.doctorId)
        .eq("status", "recorded")
        .select("*")
        .maybeSingle<Recording>();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new HttpError(
          409,
          "Recording has already been transcribed or finalized.",
          "RECORDING_NOT_TRANSCRIBABLE"
        );
      }

      return data;
    },

    async markRecordingSummarized(input): Promise<Recording> {
      const { data, error } = await supabase
        .from("recordings")
        .update({
          summary: input.summary,
          status: "summary_ready",
          pdf_storage_path: null
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

export function createTranscriptionAttemptRepository(supabase: SupabaseClient): TranscriptionAttemptRepository {
  return {
    async recordFailedAttempt(input): Promise<void> {
      const { error } = await supabase.from("transcription_attempts").insert({
        recording_id: input.recordingId,
        doctor_id: input.doctorId,
        clinic_id: input.clinicId,
        request_id: input.requestId,
        stage: input.stage,
        error_code: input.errorCode,
        error_message: input.errorMessage,
        error_status: input.errorStatus,
        audio_storage_path: input.audioStoragePath ?? null,
        audio_size_bytes: input.audioSizeBytes ?? null,
        audio_mime_type: input.audioMimeType ?? null,
        upstream_status: input.upstreamStatus ?? null,
        upstream_code: input.upstreamCode ?? null,
        upstream_type: input.upstreamType ?? null,
        upstream_message: input.upstreamMessage ?? null,
        upstream_param: input.upstreamParam ?? null
      });

      if (error) {
        throw error;
      }
    }
  };
}

export function createSupabaseAudioStorage(supabase: SupabaseClient): AudioStorage {
  return {
    async uploadRecordingAudio(input): Promise<string> {
      const normalizedMimeType = input.mimeType.toLowerCase();
      const extension =
        normalizedMimeType.includes("mp4") ||
        normalizedMimeType.includes("m4a") ||
        normalizedMimeType.includes("aac")
          ? "m4a"
          : normalizedMimeType.includes("wav") || normalizedMimeType.includes("wave")
            ? "wav"
            : "webm";
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
    },

    async downloadRecordingAudio(path: string): Promise<{ audio: Buffer; mimeType: string; filename: string; size: number }> {
      const { data, error } = await supabase.storage.from("audio").download(path);

      if (error) {
        throw error;
      }

      const arrayBuffer = await data.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);
      const filename = path.split("/").filter(Boolean).at(-1) ?? "recording";
      const normalizedPath = path.toLowerCase();
      const mimeType =
        data.type ||
        (normalizedPath.endsWith(".wav") || normalizedPath.endsWith(".wave")
          ? "audio/wav"
          : normalizedPath.endsWith(".m4a") || normalizedPath.endsWith(".mp4") || normalizedPath.endsWith(".aac")
            ? "audio/mp4"
            : "audio/webm");

      return {
        audio,
        mimeType,
        filename,
        size: audio.byteLength
      };
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
