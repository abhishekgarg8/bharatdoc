import { describe, expect, it, vi } from "vitest";
import { destinationForRegistration, fetchHospitals, lookupClinic, registerAccount } from "@/lib/client/onboarding-api";

describe("onboarding API client", () => {
  it("looks up clinics by code", async () => {
    const fetcher = vi.fn(async () => Response.json({ clinic_id: "clinic-id", clinic_name: "Sunrise Clinic", clinic_address: null }));

    await expect(lookupClinic("MED42X", fetcher as unknown as typeof fetch)).resolves.toEqual({
      clinic_id: "clinic-id",
      clinic_name: "Sunrise Clinic",
      clinic_address: null
    });
    expect(fetcher).toHaveBeenCalledWith("/api/clinics/lookup?code=MED42X");
  });

  it("registers accounts with Supabase bearer token", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "pending_approval", role: "doctor" }));

    await registerAccount(
      "id-token",
      {
        mode: "join_hospital",
        profile: { name: "Dr. Aparna Iyer", specialization: "General Physician" },
        hospital_id: "22222222-2222-4222-8222-222222222222"
      },
      fetcher as unknown as typeof fetch
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer id-token" })
      })
    );
  });

  it("loads hospital options for onboarding", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        hospitals: [{ hospital_id: "hospital-id", hospital_name: "Sunrise Hospital", hospital_address: "24 Baner Road, Pune" }]
      })
    );

    await expect(fetchHospitals(fetcher as unknown as typeof fetch)).resolves.toEqual([
      { hospital_id: "hospital-id", hospital_name: "Sunrise Hospital", hospital_address: "24 Baner Road, Pune" }
    ]);
    expect(fetcher).toHaveBeenCalledWith("/api/hospitals");
  });

  it("maps registration results to app routes", () => {
    expect(destinationForRegistration({ status: "active", role: "owner" })).toBe("/dashboard");
    expect(destinationForRegistration({ status: "pending_approval", role: "doctor" })).toBe("/pending-approval");
    expect(destinationForRegistration({ status: "existing_account", role: "doctor", account_status: "rejected" })).toBe(
      "/access-rejected"
    );
  });
});
