import { createClient } from "@supabase/supabase-js";
import { workerEnv } from "./env.js";

export const supabase = createClient(workerEnv.SUPABASE_URL, workerEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});
