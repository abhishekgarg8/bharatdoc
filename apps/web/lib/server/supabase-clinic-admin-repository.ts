import "server-only";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/server/errors";
import type {
  ActiveClinicDoctor,
  ClinicProfileUpdate,
  ClinicAdminRepository,
  JoinRequestForReview,
  PendingApproval
} from "@/lib/server/clinic-admin";

interface PendingApprovalRow {
  id: string;
  requested_at: string;
  doctors:
    | {
        id: string;
        name: string;
        specialization: string;
        phone: string;
        created_at: string;
      }
    | {
        id: string;
        name: string;
        specialization: string;
        phone: string;
        created_at: string;
      }[];
}

function firstDoctor(row: PendingApprovalRow): PendingApproval["doctor"] {
  return Array.isArray(row.doctors) ? row.doctors[0]! : row.doctors;
}

function throwReviewError(error: { code?: string; message?: string }): never {
  if (error.code === "42501") {
    throw new AppError(403, "Only an active hospital owner can review join requests.", "OWNER_REQUIRED");
  }

  if (error.code === "P0002") {
    throw new AppError(409, "Pending join request was already reviewed.", "JOIN_REQUEST_CONFLICT");
  }

  if (error.code === "22023") {
    throw new AppError(400, "Join request review status is invalid.", "JOIN_REQUEST_STATUS_INVALID");
  }

  throw error;
}

export function createSupabaseClinicAdminRepository(supabase: SupabaseClient): ClinicAdminRepository {
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

    async listActiveDoctors(clinicId: string): Promise<ActiveClinicDoctor[]> {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name, specialization, phone, role, created_at")
        .eq("clinic_id", clinicId)
        .eq("account_status", "active")
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return (data ?? []) as ActiveClinicDoctor[];
    },

    async listPendingApprovals(clinicId: string): Promise<PendingApproval[]> {
      const { data, error } = await supabase
        .from("clinic_join_requests")
        .select("id, requested_at, doctors!clinic_join_requests_doctor_id_fkey(id, name, specialization, phone, created_at)")
        .eq("clinic_id", clinicId)
        .eq("status", "pending")
        .order("requested_at", { ascending: true });

      if (error) {
        throw error;
      }

      return ((data ?? []) as PendingApprovalRow[]).map((row) => ({
        id: row.id,
        requested_at: row.requested_at,
        doctor: firstDoctor(row)
      }));
    },

    async findJoinRequestForClinic(requestId: string, clinicId: string): Promise<JoinRequestForReview | null> {
      const { data, error } = await supabase
        .from("clinic_join_requests")
        .select("id, clinic_id, doctor_id, status")
        .eq("id", requestId)
        .eq("clinic_id", clinicId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as JoinRequestForReview | null;
    },

    async approveJoinRequest(requestId: string, doctorId: string, ownerId: string): Promise<void> {
      const { error } = await supabase.rpc("review_clinic_join_request", {
        p_request_id: requestId,
        p_doctor_id: doctorId,
        p_owner_id: ownerId,
        p_status: "approved",
        p_rejection_reason: null
      });

      if (error) {
        throwReviewError(error);
      }
    },

    async rejectJoinRequest(requestId: string, doctorId: string, ownerId: string, reason: string | null): Promise<void> {
      const { error } = await supabase.rpc("review_clinic_join_request", {
        p_request_id: requestId,
        p_doctor_id: doctorId,
        p_owner_id: ownerId,
        p_status: "rejected",
        p_rejection_reason: reason
      });

      if (error) {
        throwReviewError(error);
      }
    },

    async updateClinicProfile(clinicId: string, input: ClinicProfileUpdate): Promise<Clinic> {
      const { data, error } = await supabase.from("clinics").update(input).eq("id", clinicId).select("*").single();

      if (error) {
        throw error;
      }

      return data as Clinic;
    }
  };
}
