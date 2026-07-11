import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), rpc: vi.fn(), maybeSingle: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequestUser: mocks.verify }));
vi.mock("@/lib/server/supabase-auth", () => ({ createSupabaseAuthVerifier: vi.fn(() => ({})) }));
vi.mock("@/lib/server/supabase", () => ({ createSupabaseServerClient: () => ({
  rpc: mocks.rpc,
  from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })) })) }))
}) }));
vi.mock("@/lib/server/phi-deletion", async (original) => {
  const actual = await original<typeof import("@/lib/server/phi-deletion")>();
  return { ...actual, processDeletionReceipt: mocks.process };
});

import { GET, POST } from "@/app/api/deletions/[id]/route";
const context = { params: Promise.resolve({ id: "receipt-1" }) };
const request = (method = "GET") => new Request("https://example.test/api/deletions/receipt-1", { method });
const raw = { id: "receipt-1", state: "failed", object_count: 2, deleted_object_count: 1,
  error_code: "OBJECT_CLEANUP_INCOMPLETE", completed_at: null, subject_hash: "private", actor_hash: "private" };

describe("record deletion receipt route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue({ uid: "auth-user" });
    mocks.maybeSingle.mockResolvedValue({ data: { id: "doctor-1" }, error: null });
    mocks.rpc.mockResolvedValue({ data: raw, error: null });
  });

  it("returns only an actor-authorized non-PHI status", async () => {
    const response = await GET(request(), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("get_deletion_receipt_for_doctor", {
      p_receipt_id: "receipt-1", p_doctor_id: "doctor-1"
    });
    expect(JSON.stringify(body)).not.toMatch(/subject_hash|actor_hash|private/);
  });

  it("does not disclose another doctor's receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
  });

  it("retries failed object cleanup and returns completion", async () => {
    mocks.process.mockResolvedValue({ ...raw, state: "completed", deleted_object_count: 2, error_code: null });
    const response = await POST(request("POST"), context);
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith(expect.anything(), "receipt-1");
  });
});
