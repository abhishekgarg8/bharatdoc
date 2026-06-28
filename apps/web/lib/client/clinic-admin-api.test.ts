import { describe, expect, it, vi } from "vitest";
import {
  approvePendingDoctor,
  fetchClinicAdminSnapshot,
  fetchPendingApprovals,
  reapproveClinicDoctor,
  rejectPendingDoctor,
  removeClinicDoctor,
  updateClinicProfile
} from "@/lib/client/clinic-admin-api";

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

  it("loads clinic admin snapshot with clinic and active doctors", async () => {
    const snapshot = {
      clinic: {
        id: "clinic-1",
        name: "Sunrise Clinic",
        code: "MED42X",
        address: "24 Baner Road, Pune",
        activeDoctorsCount: 2
      },
      activeDoctors: [
        {
          id: "doctor-1",
          name: "Dr. Aparna Iyer",
          specialization: "General Physician",
          phone: "+91 98765 43210",
          role: "owner" as const,
          recordings_count: 3,
          created_at: "2026-04-23T09:00:00.000Z"
        }
      ],
      rejectedDoctors: [
        {
          id: "doctor-removed",
          name: "Dr. Sameer",
          specialization: "General Physician",
          phone: "+91 98000 11122",
          role: "doctor" as const,
          account_status: "rejected" as const,
          recordings_count: 1,
          created_at: "2026-04-22T09:00:00.000Z"
        }
      ],
      pendingApprovals: [
        {
          id: "request-1",
          requested_at: "2026-04-23T07:10:00.000Z",
          doctor: {
            id: "doctor-2",
            name: "Dr. Meera Shah",
            specialization: "Pediatrician",
            phone: "+91 98340 12340",
            created_at: "2026-04-23T07:10:00.000Z"
          }
        }
      ]
    };
    const fetcher = vi.fn(async () => Response.json(snapshot)) as unknown as typeof fetch;

    await expect(fetchClinicAdminSnapshot("id-token", fetcher)).resolves.toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/admin", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("updates the clinic profile through the owner admin endpoint", async () => {
    const clinic = {
      id: "clinic-1",
      name: "Sunrise Family Clinic",
      code: "MED42X",
      address: null,
      activeDoctorsCount: 2
    };
    const fetcher = vi.fn(async () => Response.json({ clinic })) as unknown as typeof fetch;

    await expect(
      updateClinicProfile("id-token", { name: "Sunrise Family Clinic", code: "ABC123", address: null }, fetcher)
    ).resolves.toEqual(clinic);
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/admin", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: "Sunrise Family Clinic", code: "ABC123", address: null })
    });
  });

  it("removes and re-approves clinic doctors through owner endpoints", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true })) as unknown as typeof fetch;

    await expect(removeClinicDoctor("id-token", "doctor-1", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/doctors/doctor-1/remove", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });

    await expect(reapproveClinicDoctor("id-token", "doctor-1", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/clinic/doctors/doctor-1/reapprove", {
      method: "POST",
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });
});
