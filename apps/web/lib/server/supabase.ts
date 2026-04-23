import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getWebEnv } from "@/lib/server/env";

export function createSupabaseServerClient() {
  const webEnv = getWebEnv();

  return createClient(webEnv.SUPABASE_URL, webEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false
    }
  });
}
