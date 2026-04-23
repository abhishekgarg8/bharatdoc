import { describe, expect, it, vi } from "vitest";
import { destinationForDoctorStatus, fetchCurrentDoctor } from "@/lib/client/session";

describe("session client helpers", () => {
  it("maps doctor account status to routes", () => {
    expect(destinationForDoctorStatus("active")).toBe("/dashboard");
    expect(destinationForDoctorStatus("pending_approval")).toBe("/pending-approval");
    expect(destinationForDoctorStatus("rejected")).toBe("/access-rejected");
  });

  it("loads current doctor using bearer token", async () => {
    const fetcher = vi.fn(async () => Response.json({ doctor: { account_status: "active" } }));

    await expect(fetchCurrentDoctor("id-token", fetcher as unknown as typeof fetch)).resolves.toEqual({
      doctor: { account_status: "active" }
    });
    expect(fetcher).toHaveBeenCalledWith("/api/me", {
      headers: { Authorization: "Bearer id-token" }
    });
  });
});
