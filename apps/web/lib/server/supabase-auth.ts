import "server-only";
import type { User } from "@supabase/supabase-js";
import { AppError } from "@/lib/server/errors";
import type { TokenVerifier, VerifiedUser } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/server/supabase";

function userContact(user: User): string {
  const metadataEmail = user.user_metadata?.email;

  if (typeof metadataEmail === "string" && metadataEmail.trim()) {
    return metadataEmail.trim();
  }

  return user.email ?? user.id;
}

export function createSupabaseAuthVerifier(): TokenVerifier {
  return {
    async verifyIdToken(token: string): Promise<VerifiedUser> {
      const { data, error } = await createSupabaseServerClient().auth.getUser(token);

      if (error || !data.user) {
        throw new AppError(401, "Supabase token verification failed.", "AUTH_REQUIRED");
      }

      return {
        uid: data.user.id,
        phoneNumber: userContact(data.user)
      };
    }
  };
}
