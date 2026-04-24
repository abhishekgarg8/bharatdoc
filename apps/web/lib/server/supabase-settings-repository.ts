import "server-only";
import type { Doctor } from "@bharatdoc/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DoctorPreferencesRepository, DoctorPreferencesUpdate } from "@/lib/server/settings";

export function createSupabaseSettingsRepository(supabase: SupabaseClient): DoctorPreferencesRepository {
  return {
    async findDoctorByAuthUid(authUid: string): Promise<Doctor | null> {
      const { data, error } = await supabase.from("doctors").select("*").eq("firebase_uid", authUid).maybeSingle();

      if (error) {
        throw error;
      }

      return data as Doctor | null;
    },

    async updateDoctorPreferences(doctorId: string, input: DoctorPreferencesUpdate): Promise<Doctor> {
      const { data, error } = await supabase.from("doctors").update(input).eq("id", doctorId).select("*").single();

      if (error) {
        throw error;
      }

      return data as Doctor;
    }
  };
}
