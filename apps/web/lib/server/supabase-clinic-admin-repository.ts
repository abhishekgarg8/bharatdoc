import "server-only";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
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

    async findClinicByCode(clinicCode: string): Promise<Clinic | null> {
      const { data, error } = await supabase.from("clinics").select("*").eq("clinic_code", clinicCode).maybeSingle();

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
      const { error: requestError } = await supabase
        .from("clinic_join_requests")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: ownerId
        })
        .eq("id", requestId);

      if (requestError) {
        throw requestError;
      }

      const { error: doctorError } = await supabase
        .from("doctors")
        .update({ account_status: "active" })
        .eq("id", doctorId);

      if (doctorError) {
        throw doctorError;
      }
    },

    async rejectJoinRequest(requestId: string, doctorId: string, ownerId: string, reason: string | null): Promise<void> {
      const { error: requestError } = await supabase
        .from("clinic_join_requests")
        .update({
          status: "rejected",
          rejection_reason: reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: ownerId
        })
        .eq("id", requestId);

      if (requestError) {
        throw requestError;
      }

      const { error: doctorError } = await supabase
        .from("doctors")
        .update({ account_status: "rejected" })
        .eq("id", doctorId);

      if (doctorError) {
        throw doctorError;
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
