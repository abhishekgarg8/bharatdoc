import { describe, expect, it, vi } from "vitest";
import { approvePendingDoctor, fetchPendingApprovals, rejectPendingDoctor } from "@/lib/client/clinic-admin-api";

describe("clinic admin API client", () => {
  it("loads pending approvals with a bearer token", async () => {
    const pending = [
      {
        id: "request-1",
        requested_at: "2026-04-23T07:10:00.000Z",
        doctor: {
          id: "doctor-1",
          name: "Dr. Meera Shah",
          specialization: "Pediatrician",
          phone: "+91 98340 12340",
          created_at: "2026-04-23T07:10:00.000Z"
        }
      }
    ];
    const fetcher = vi.fn(async () => Response.json({ pending })) as unknown as typeof fetch;

    await expect(fetchPendingApprovals("id-token", fetcher)).resolves.toEqual(pending);
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("approves pending doctors through the owner endpoint", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    await expect(approvePendingDoctor("id-token", "request-1", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests/request-1/approve", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("rejects pending doctors with an optional reason", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    await expect(rejectPendingDoctor("id-token", "request-1", "Not recognised", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/join-requests/request-1/reject", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: "Not recognised" })
    });
  });
});
