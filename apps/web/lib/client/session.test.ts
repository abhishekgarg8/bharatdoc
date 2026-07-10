import { describe, expect, it, vi } from "vitest";
import { destinationForDoctorStatus, destinationForInactiveDoctor, fetchCurrentDoctor } from "@/lib/client/session";

describe("session client helpers", () => {
  it("maps doctor account status to routes", () => {
    expect(destinationForDoctorStatus("active")).toBe("/dashboard");
    expect(destinationForDoctorStatus("pending_approval")).toBe("/pending-approval");
    expect(destinationForDoctorStatus("rejected")).toBe("/access-rejected");
  });

  it("returns only inactive account redirect destinations", () => {
    expect(destinationForInactiveDoctor({ account_status: "active" } as never)).toBeNull();
    expect(destinationForInactiveDoctor({ account_status: "pending_approval" } as never)).toBe("/pending-approval");
    expect(destinationForInactiveDoctor({ account_status: "rejected" } as never)).toBe("/access-rejected");
  });

  it("loads current doctor using bearer token", async () => {
    const fetcher = vi.fn(async () => Response.json({ doctor: { accountStatus: "active" }, clinic: null }));

    await expect(fetchCurrentDoctor("id-token", fetcher as unknown as typeof fetch)).resolves.toEqual({
      doctor: { accountStatus: "active" },
      clinic: null
    });
    expect(fetcher).toHaveBeenCalledWith("/api/me", {
      headers: { Authorization: "Bearer id-token" }
    });
  });
});
