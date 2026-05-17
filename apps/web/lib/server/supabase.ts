import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getWebEnv } from "@/lib/server/env";

function supabaseNoStoreFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    cache: "no-store",
  });
}

export function createSupabaseServerClient() {
  const webEnv = getWebEnv();

  return createClient(webEnv.SUPABASE_URL, webEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
    },
    global: {
      fetch: supabaseNoStoreFetch,
    },
  });
}
