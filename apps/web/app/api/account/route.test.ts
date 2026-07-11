import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn(), deleteUser: vi.fn(), process: vi.fn()
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequestUser: mocks.verify }));
vi.mock("@/lib/server/supabase-auth", () => ({ createSupabaseAuthVerifier: vi.fn(() => ({})) }));
vi.mock("@/lib/server/supabase", () => ({ createSupabaseServerClient: () => ({
  rpc: mocks.rpc,
  from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })) })),
  auth: { admin: { deleteUser: mocks.deleteUser } }
}) }));
vi.mock("@/lib/server/phi-deletion", async (original) => {
  const actual = await original<typeof import("@/lib/server/phi-deletion")>();
  return { ...actual, processDeletionReceipt: mocks.process };
});

import { DELETE } from "@/app/api/account/route";

const request = () => new Request("https://example.test/api/account", { method: "DELETE", headers: { authorization: "Bearer token" } });
const raw = { id: "receipt-1", state: "queued", object_count: 1, deleted_object_count: 0, error_code: null,
  completed_at: null, subject_hash: "private-subject", actor_hash: "private-actor" };

describe("account deletion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "auth-user" });
    mocks.maybeSingle.mockResolvedValue({ data: { id: "doctor-1" }, error: null });
    mocks.deleteUser.mockResolvedValue({ error: null });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "find_account_deletion") return { data: null, error: null };
      if (name === "request_account_deletion") return { data: raw, error: null };
      if (name === "claim_account_auth_deletion") return { data: [{ auth_user_id: "auth-user", lease_token: "lease" }], error: null };
      if (name === "complete_account_auth_deletion") return { data: { ...raw, state: "completed", error_code: null }, error: null };
      return { data: null, error: null };
    });
  });

  it("resumes after profile removal, completes auth deletion, and never returns private hashes", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "find_account_deletion") return { data: name && raw, error: null };
      if (name === "claim_account_auth_deletion") return { data: [{ auth_user_id: "auth-user", lease_token: "lease" }], error: null };
      if (name === "complete_account_auth_deletion") return { data: { ...raw, state: "completed", error_code: null }, error: null };
      return { data: null, error: null };
    });
    mocks.process.mockResolvedValue({ ...raw, state: "running", error_code: "AUTH_DELETE_PENDING" });
    const response = await DELETE(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.deleteUser).toHaveBeenCalledWith("auth-user");
    expect(JSON.stringify(body)).not.toMatch(/private-subject|private-actor|subject_hash|actor_hash/);
    expect(body.deletion.state).toBe("completed");
  });

  it("returns 202 and retains retry state when object cleanup is incomplete", async () => {
    mocks.process.mockResolvedValue({ ...raw, state: "failed", error_code: "OBJECT_CLEANUP_INCOMPLETE" });
    const response = await DELETE(request());
    expect(response.status).toBe(202);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["ACCOUNT_OWNER_TRANSFER_REQUIRED", "ACCOUNT_OWNER_TRANSFER_REQUIRED"],
    ["RECORDING_PROCESSING_ACTIVE", "RECORDING_PROCESSING_ACTIVE"]
  ])("maps %s to an actionable conflict", async (message, code) => {
    mocks.rpc.mockImplementation(async (name: string) => name === "find_account_deletion"
      ? { data: null, error: null }
      : { data: null, error: new Error(message) });
    const response = await DELETE(request());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it("treats an already-absent auth identity as idempotent success", async () => {
    mocks.process.mockResolvedValue({ ...raw, state: "running", error_code: "AUTH_DELETE_PENDING" });
    mocks.deleteUser.mockResolvedValue({ error: { status: 404 } });
    const response = await DELETE(request());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_account_auth_deletion", expect.anything());
  });
});
