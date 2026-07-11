import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), deleteUser: vi.fn(), processBatch: vi.fn(), artifacts: vi.fn() }));
vi.mock("@/lib/server/supabase", () => ({ createSupabaseServerClient: () => ({
  rpc: mocks.rpc,
  auth: { admin: { deleteUser: mocks.deleteUser } }
}) }));
vi.mock("@/lib/server/phi-deletion", () => ({
  processDeletionReceiptBatch: mocks.processBatch,
  processProcessingArtifactCleanup: mocks.artifacts
}));

import { GET } from "@/app/api/internal/retention/route";

function request(secret = "retention-secret") {
  return new Request("https://bharatdoc.test/api/internal/retention", {
    headers: { authorization: `Bearer ${secret}` }
  });
}

describe("retention finalizer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "retention-secret");
    mocks.artifacts.mockResolvedValue({ claimed: 0, deleted: 0, failed: 0 });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "reconcile_retention_and_orphans") return { data: { orphan_objects_queued: 0 }, error: null };
      if (name === "list_deletion_receipts_for_processing") return { data: [], error: null };
      if (name === "claim_account_auth_deletion") return { data: [], error: null };
      return { data: null, error: null };
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when the configured cron bearer secret is missing or wrong", async () => {
    await expect(GET(request("wrong"))).resolves.toMatchObject({ status: 401 });
    vi.stubEnv("CRON_SECRET", "");
    await expect(GET(request("retention-secret"))).resolves.toMatchObject({ status: 401 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("runs reconciliation and bounded receipt processing only when authorized", async () => {
    mocks.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => {
      if (name === "reconcile_retention_and_orphans") return { data: { orphan_objects_queued: 1 }, error: null };
      if (name === "list_deletion_receipts_for_processing") {
        return input.p_limit === 10
          ? { data: [{ id: "receipt-1" }], error: null }
          : { data: [], error: null };
      }
      if (name === "claim_account_auth_deletion") return { data: [], error: null };
      return { data: null, error: null };
    });
    mocks.processBatch.mockResolvedValue({ receipt: { state: "completed" }, claimed: 1, failed: 0 });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.processBatch).toHaveBeenCalledTimes(1);
    expect(mocks.artifacts).toHaveBeenCalledTimes(1);
    expect(mocks.processBatch).toHaveBeenCalledWith(expect.anything(), "receipt-1");
    expect(mocks.rpc).toHaveBeenCalledWith("list_deletion_receipts_for_processing", { p_limit: 10 });
    expect(mocks.rpc).toHaveBeenCalledWith("list_deletion_receipts_for_processing", { p_limit: 50 });
    await expect(response.json()).resolves.toMatchObject({ ok: true, receipts_completed: 1 });
  });

  it("treats an already-absent queued auth identity as idempotently deleted", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "reconcile_retention_and_orphans") return { data: {}, error: null };
      if (name === "list_deletion_receipts_for_processing") return { data: [], error: null };
      if (name === "claim_account_auth_deletion") {
        return { data: [{ receipt_id: "receipt-1", auth_user_id: "auth-user", lease_token: "lease" }], error: null };
      }
      return { data: null, error: null };
    });
    mocks.deleteUser.mockResolvedValue({ error: { status: 404 } });

    await expect(GET(request())).resolves.toMatchObject({ status: 200 });
    expect(mocks.rpc).toHaveBeenCalledWith("complete_account_auth_deletion", {
      p_receipt_id: "receipt-1", p_lease_token: "lease"
    });
  });

  it("does not hot-loop a released processing artifact failure", async () => {
    mocks.artifacts.mockResolvedValue({ claimed: 20, deleted: 19, failed: 1 });

    await expect(GET(request())).resolves.toMatchObject({ status: 200 });

    expect(mocks.artifacts).toHaveBeenCalledTimes(1);
  });

  it("does not hot-loop a released deletion-object failure", async () => {
    mocks.rpc.mockImplementation(async (name: string, input: Record<string, unknown>) => {
      if (name === "reconcile_retention_and_orphans") return { data: {}, error: null };
      if (name === "list_deletion_receipts_for_processing") {
        return input.p_limit === 10 ? { data: [{ id: "receipt-1" }], error: null } : { data: [], error: null };
      }
      if (name === "claim_account_auth_deletion") return { data: [], error: null };
      return { data: null, error: null };
    });
    mocks.processBatch.mockResolvedValue({ receipt: { state: "failed" }, claimed: 20, failed: 1 });

    await expect(GET(request())).resolves.toMatchObject({ status: 200 });

    expect(mocks.processBatch).toHaveBeenCalledTimes(1);
  });

  it("does not hot-loop a released auth deletion failure", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "reconcile_retention_and_orphans") return { data: {}, error: null };
      if (name === "list_deletion_receipts_for_processing") return { data: [], error: null };
      if (name === "claim_account_auth_deletion") {
        return { data: [{ receipt_id: "receipt-1", auth_user_id: "auth-user", lease_token: "lease" }], error: null };
      }
      return { data: null, error: null };
    });
    mocks.deleteUser.mockResolvedValue({ error: { status: 503 } });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({ auth_failures: 1 });
  });
});
