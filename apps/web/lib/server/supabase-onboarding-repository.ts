import "server-only";
import type { Clinic, Doctor, JoinClinicRegistrationInput, CreateClinicRegistrationInput } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OnboardingRepository, PendingJoinRequest } from "@/lib/server/onboarding";

function normalizeOptional(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

export function createSupabaseOnboardingRepository(supabase: SupabaseClient): OnboardingRepository {
  return {
    async findDoctorByFirebaseUid(firebaseUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase.from("doctors").select("*").eq("firebase_uid", firebaseUid).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Doctor | null;
    },

    async findClinicByCode(clinicCode: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("clinic_code", clinicCode).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Clinic | null;
    },

    async createOwner(input: {
      firebaseUid: string;
      phone: string;
      profile: CreateClinicRegistrationInput;
      clinicCode: string;
    }): Promise<{ doctor: Doctor; clinic: Clinic }> {
      const { data: clinic, error: clinicError } = await supabase
        .from("clinics")
        .insert({
          name: input.profile.clinic.name,
          clinic_code: input.clinicCode,
          address: normalizeOptional(input.profile.clinic.address),
          logo_storage_path: normalizeOptional(input.profile.clinic.logo_storage_path)
        })
        .select("*")
        .single();

      if (clinicError) {
        throw clinicError;
      }

      const { data: doctor, error: doctorError } = await supabase
        .from("doctors")
        .insert({
          firebase_uid: input.firebaseUid,
          clinic_id: clinic.id,
          role: "owner",
          account_status: "active",
          name: input.profile.profile.name,
          specialization: input.profile.profile.specialization,
          medical_reg_no: normalizeOptional(input.profile.profile.medical_reg_no),
          phone: input.phone,
          profile_photo_path: normalizeOptional(input.profile.profile.profile_photo_path),
          transcription_lang: "auto"
        })
        .select("*")
        .single();

      if (doctorError) {
        throw doctorError;
      }

      return { clinic: clinic as Clinic, doctor: doctor as Doctor };
    },

    async createDoctorJoinRequest(input: {
      firebaseUid: string;
      phone: string;
      profile: JoinClinicRegistrationInput;
      clinic: Clinic;
    }): Promise<{ doctor: Doctor; clinic: Clinic; joinRequest: PendingJoinRequest }> {
      const { data: doctor, error: doctorError } = await supabase
        .from("doctors")
        .insert({
          firebase_uid: input.firebaseUid,
          clinic_id: input.clinic.id,
          role: "doctor",
          account_status: "pending_approval",
          name: input.profile.profile.name,
          specialization: input.profile.profile.specialization,
          medical_reg_no: normalizeOptional(input.profile.profile.medical_reg_no),
          phone: input.phone,
          profile_photo_path: normalizeOptional(input.profile.profile.profile_photo_path),
          transcription_lang: "auto"
        })
        .select("*")
        .single();

      if (doctorError) {
        throw doctorError;
      }

      const { data: joinRequest, error: joinRequestError } = await supabase
        .from("clinic_join_requests")
        .insert({
          clinic_id: input.clinic.id,
          doctor_id: doctor.id,
          status: "pending"
        })
        .select("id, clinic_id, doctor_id, status")
        .single();

      if (joinRequestError) {
        throw joinRequestError;
      }

      return {
        doctor: doctor as Doctor,
        clinic: input.clinic,
        joinRequest: joinRequest as PendingJoinRequest
      };
    }
  };
}
