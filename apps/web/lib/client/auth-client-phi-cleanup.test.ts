import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn(), purge: vi.fn(), clearLogs: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: {
  getSession: mocks.getSession, signOut: mocks.signOut, onAuthStateChange: vi.fn()
} }) }));
vi.mock("@/lib/client/local-recordings", async (original) => ({
  ...await original<typeof import("@/lib/client/local-recordings")>(),
  purgeLocalRecordingsForAuthUser: mocks.purge
}));
vi.mock("@/lib/client/device-logs", async (original) => ({
  ...await original<typeof import("@/lib/client/device-logs")>(), clearDeviceLogs: mocks.clearLogs
}));
import { createSupabaseAuthClient } from "@/lib/client/auth-client";

function token(subject: string) {
  const payload = btoa(JSON.stringify({ sub: subject })).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
  return `header.${payload}.signature`;
}

describe("auth sign-out PHI cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.purge.mockResolvedValue(0);
  });

  it("purges the current auth subject and device logs before ending the session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: token("auth-user-1") } }, error: null });
    await createSupabaseAuthClient().signOut();
    expect(mocks.purge).toHaveBeenCalledWith("auth-user-1");
    expect(mocks.clearLogs).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("still signs out if local purge fails and requests legacy-only cleanup without a token", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    mocks.purge.mockRejectedValue(new Error("IndexedDB unavailable"));
    await expect(createSupabaseAuthClient().signOut()).resolves.toBeUndefined();
    expect(mocks.purge).toHaveBeenCalledWith(null);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
