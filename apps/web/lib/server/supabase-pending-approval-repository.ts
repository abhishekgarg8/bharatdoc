import "server-only";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PendingApprovalJoinRequest,
  PendingApprovalOwner,
  PendingApprovalRepository
} from "@/lib/server/pending-approval";

export function createSupabasePendingApprovalRepository(supabase: SupabaseClient): PendingApprovalRepository {
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

    async findActiveOwnerForClinic(clinicId: string): Promise<PendingApprovalOwner | null> {
      const { data, error } = await supabase
        .from("doctors")
        .select("id, name")
        .eq("clinic_id", clinicId)
        .eq("role", "owner")
        .eq("account_status", "active")
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        throw error;
      }

      return (data?.[0] as PendingApprovalOwner | undefined) ?? null;
    },

    async findPendingJoinRequestForDoctor(
      doctorId: string,
      clinicId: string
    ): Promise<PendingApprovalJoinRequest | null> {
      const { data, error } = await supabase
        .from("clinic_join_requests")
        .select("id, requested_at, status")
        .eq("doctor_id", doctorId)
        .eq("clinic_id", clinicId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      return (data?.[0] as PendingApprovalJoinRequest | undefined) ?? null;
    }
  };
}
