import { describe, expect, it, vi } from "vitest";
import {
  AuthSessionExpiredError,
  isAuthSessionExpiredError,
  parseJsonOrThrow,
  recoverExpiredSession
} from "@/lib/client/api-error";

describe("client API error handling", () => {
  it("maps 401 API responses to auth-expired errors", async () => {
    await expect(
      parseJsonOrThrow(
        Response.json({ error: { code: "AUTH_REQUIRED", message: "Supabase token verification failed." } }, { status: 401 }),
        "Unable to load."
      )
    ).rejects.toBeInstanceOf(AuthSessionExpiredError);
  });

  it("signs out and navigates to onboarding for expired sessions", async () => {
    const signOut = vi.fn(async () => undefined);
    const navigate = vi.fn();

    await expect(recoverExpiredSession(new AuthSessionExpiredError(), signOut, navigate)).resolves.toBe(true);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/onboarding");
  });

  it("does not handle non-auth API errors", async () => {
    const error = new Error("Unable to load dashboard.");

    await expect(recoverExpiredSession(error, vi.fn(), vi.fn())).resolves.toBe(false);
    expect(isAuthSessionExpiredError(error)).toBe(false);
  });
});
