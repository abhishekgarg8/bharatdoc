import "server-only";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib/server/errors";
import type {
  ActiveClinicDoctor,
  ClinicProfileUpdate,
  ClinicAdminRepository,
  JoinRequestForReview,
  PendingApproval,
  ReviewedClinicDoctor
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

function withZeroRecordingCount<T extends object>(doctor: T): T & { recordings_count: number } {
  return {
    ...doctor,
    recordings_count: 0
  };
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

      return ((data ?? []) as Omit<ActiveClinicDoctor, "recordings_count">[]).map(withZeroRecordingCount);
    },

    async listRejectedDoctors(clinicId: string): Promise<ReviewedClinicDoctor[]> {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name, specialization, phone, role, account_status, created_at")
        .eq("clinic_id", clinicId)
        .eq("account_status", "rejected")
        .order("created_at", { ascending: true });

      if (error) {
        throw error;
      }

      return ((data ?? []) as Omit<ReviewedClinicDoctor, "recordings_count">[]).map(withZeroRecordingCount);
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

    async countRecordingsByDoctorIds(clinicId: string, doctorIds: string[]): Promise<Record<string, number>> {
      if (doctorIds.length === 0) {
        return {};
      }

      const { data, error } = await supabase
        .from("recordings")
        .select("doctor_id")
        .eq("clinic_id", clinicId)
        .in("doctor_id", doctorIds);

      if (error) {
        throw error;
      }

      return ((data ?? []) as { doctor_id: string }[]).reduce<Record<string, number>>((counts, row) => {
        counts[row.doctor_id] = (counts[row.doctor_id] ?? 0) + 1;
        return counts;
      }, {});
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

    async updateDoctorAccountStatus(doctorId: string, clinicId: string, status: "active" | "rejected"): Promise<void> {
      const { data, error } = await supabase
        .from("doctors")
        .update({ account_status: status })
        .eq("id", doctorId)
        .eq("clinic_id", clinicId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new AppError(404, "Doctor was not found in this hospital.", "DOCTOR_NOT_FOUND");
      }
    },

    async updateClinicProfile(clinicId: string, input: ClinicProfileUpdate): Promise<Clinic> {
      const update: Record<string, string | null> = {};

      if (input.name !== undefined) {
        update.name = input.name;
      }

      if (input.code !== undefined) {
        update.clinic_code = input.code;
      }

      if (input.address !== undefined) {
        update.address = input.address;
      }

      const { data, error } = await supabase.from("clinics").update(update).eq("id", clinicId).select("*").single();

      if (error) {
        throw error;
      }

      return data as Clinic;
    }
  };
}
