import type { SupabaseClient, User } from "@supabase/supabase-js";
import { HttpError } from "./http-errors.js";
import type { AuthTokenVerifier, VerifiedAuthToken } from "./types.js";

function verifiedTokenFromUser(user: User): VerifiedAuthToken {
  return {
    uid: user.id,
    ...(user.email ? { email: user.email } : {})
  };
}

export function createSupabaseTokenVerifier(supabase: SupabaseClient): AuthTokenVerifier {
  return {
    async verifyIdToken(token: string): Promise<VerifiedAuthToken> {
      const { data, error } = await supabase.auth.getUser(token);

      if (error || !data.user) {
        throw new HttpError(401, "Supabase token verification failed.", "AUTH_REQUIRED");
      }

      return verifiedTokenFromUser(data.user);
    }
  };
}
