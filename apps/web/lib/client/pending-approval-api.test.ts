import { describe, expect, it, vi } from "vitest";
import { AuthSessionExpiredError } from "@/lib/client/api-error";
import { fetchPendingApprovalStatus } from "@/lib/client/pending-approval-api";

describe("pending approval api client", () => {
  it("loads pending approval status with bearer auth", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        account_status: "pending_approval",
        clinic: {
          id: "clinic-1",
          name: "Bharat QA Clinic",
          code: "R2BJZZ",
          address: null
        },
        owner: null,
        join_request: null
      })
    ) as unknown as typeof fetch;

    await expect(fetchPendingApprovalStatus("id-token", fetcher)).resolves.toMatchObject({
      account_status: "pending_approval",
      clinic: {
        code: "R2BJZZ"
      }
    });
    expect(fetcher).toHaveBeenCalledWith("/api/onboarding/pending-status", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("throws an auth-expired error when the pending approval API returns 401", async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { code: "AUTH_REQUIRED" } }, { status: 401 })) as unknown as typeof fetch;

    await expect(fetchPendingApprovalStatus("bad-token", fetcher)).rejects.toBeInstanceOf(AuthSessionExpiredError);
  });
});
