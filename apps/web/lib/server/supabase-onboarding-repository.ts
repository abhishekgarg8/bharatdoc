import "server-only";
import type { Clinic, Doctor, ProfileInput } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ExistingDoctorAccountError,
  type OnboardingRepository,
  type PendingJoinRequest
} from "@/lib/server/onboarding";

function normalizeOptional(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

interface OwnerAccountRpcResult {
  clinic?: Clinic;
  doctor?: Doctor;
  existing_doctor?: Doctor;
}

interface DoctorJoinRpcResult extends OwnerAccountRpcResult {
  join_request?: PendingJoinRequest;
}

function requireOwnerAccountResult(data: unknown): { doctor: Doctor; clinic: Clinic } {
  const result = data as OwnerAccountRpcResult | null;

  if (result?.existing_doctor) {
    throw new ExistingDoctorAccountError(result.existing_doctor);
  }

  if (!result?.doctor || !result.clinic) {
    throw new Error("Onboarding owner RPC returned an invalid payload.");
  }

  return {
    doctor: result.doctor,
    clinic: result.clinic
  };
}

function requireDoctorJoinResult(data: unknown): { doctor: Doctor; clinic: Clinic; joinRequest: PendingJoinRequest } {
  const result = data as DoctorJoinRpcResult | null;

  if (result?.existing_doctor) {
    throw new ExistingDoctorAccountError(result.existing_doctor);
  }

  if (!result?.doctor || !result.clinic || !result.join_request) {
    throw new Error("Onboarding join-request RPC returned an invalid payload.");
  }

  return {
    doctor: result.doctor,
    clinic: result.clinic,
    joinRequest: result.join_request
  };
}

export function createSupabaseOnboardingRepository(supabase: SupabaseClient): OnboardingRepository {
  return {
    async findDoctorByAuthUid(authUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase.from("doctors").select("*").eq("firebase_uid", authUid).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Doctor | null;
    },

    async listHospitals(): Promise<Clinic[]> {
      const { data, error } = await supabase.from("clinics").select("*").order("name", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as Clinic[];
    },

    async findClinicById(clinicId: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("id", clinicId).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Clinic | null;
    },

    async findClinicByCode(clinicCode: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("clinic_code", clinicCode).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Clinic | null;
    },

    async createOwner(input: {
      authUid: string;
      phone: string;
      profile: ProfileInput;
      hospital: {
        name: string;
        address?: string | undefined;
        logo_storage_path?: string | undefined;
      };
      clinicCode: string;
    }): Promise<{ doctor: Doctor; clinic: Clinic }> {
      const { data, error } = await supabase.rpc("create_owner_account", {
        p_auth_uid: input.authUid,
        p_phone: input.phone,
        p_name: input.profile.name,
        p_specialization: input.profile.specialization,
        p_profile_photo_path: normalizeOptional(input.profile.profile_photo_path),
        p_clinic_name: input.hospital.name,
        p_clinic_code: input.clinicCode,
        p_clinic_address: normalizeOptional(input.hospital.address),
        p_logo_storage_path: normalizeOptional(input.hospital.logo_storage_path)
      });

      if (error) {
        throw error;
      }

      return requireOwnerAccountResult(data);
    },

    async createDoctorJoinRequest(input: {
      authUid: string;
      phone: string;
      profile: ProfileInput;
      clinic: Clinic;
      autoApprove: boolean;
    }): Promise<{ doctor: Doctor; clinic: Clinic; joinRequest: PendingJoinRequest }> {
      const { data, error } = await supabase.rpc("create_doctor_join_request", {
        p_auth_uid: input.authUid,
        p_phone: input.phone,
        p_name: input.profile.name,
        p_specialization: input.profile.specialization,
        p_profile_photo_path: normalizeOptional(input.profile.profile_photo_path),
        p_clinic_id: input.clinic.id,
        p_auto_approve: input.autoApprove
      });

      if (error) {
        throw error;
      }

      return requireDoctorJoinResult(data);
    }
  };
}
