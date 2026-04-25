import { describe, expect, it, vi } from "vitest";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import {
  getPendingApprovalStatusForUser,
  type PendingApprovalRepository
} from "@/lib/server/pending-approval";

const pendingDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "auth-pending",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "pending_approval",
  name: "Dr. Pending",
  specialization: "General Physician",
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-25T03:40:00.000Z"
};

const clinic: Clinic = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Bharat QA Clinic",
  clinic_code: "R2BJZZ",
  address: "Pune",
  logo_storage_path: null,
  created_at: "2026-04-25T03:30:00.000Z"
};

function createRepository(doctor: Doctor | null = pendingDoctor): PendingApprovalRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => doctor),
    findClinicById: vi.fn(async () => clinic),
    findActiveOwnerForClinic: vi.fn(async () => ({
      id: "owner-1",
      name: "Dr. QA Owner"
    })),
    findPendingJoinRequestForDoctor: vi.fn(async () => ({
      id: "request-1",
      requested_at: "2026-04-25T03:44:00.000Z",
      status: "pending" as const
    }))
  };
}

describe("pending approval service", () => {
  it("returns live clinic, owner, and request details for pending doctors", async () => {
    const repository = createRepository();

    await expect(
      getPendingApprovalStatusForUser({ uid: "auth-pending", phoneNumber: "pending@example.com" }, repository)
    ).resolves.toMatchObject({
      account_status: "pending_approval",
      clinic: {
        name: "Bharat QA Clinic",
        code: "R2BJZZ"
      },
      owner: {
        name: "Dr. QA Owner"
      },
      join_request: {
        requested_at: "2026-04-25T03:44:00.000Z"
      }
    });
    expect(repository.findClinicById).toHaveBeenCalledWith(pendingDoctor.clinic_id);
    expect(repository.findActiveOwnerForClinic).toHaveBeenCalledWith(clinic.id);
    expect(repository.findPendingJoinRequestForDoctor).toHaveBeenCalledWith(pendingDoctor.id, clinic.id);
  });

  it("redirects active and rejected doctors to their correct destinations", async () => {
    await expect(
      getPendingApprovalStatusForUser(
        { uid: "auth-active", phoneNumber: "active@example.com" },
        createRepository({ ...pendingDoctor, account_status: "active" })
      )
    ).resolves.toMatchObject({
      account_status: "active",
      redirectTo: "/dashboard"
    });

    await expect(
      getPendingApprovalStatusForUser(
        { uid: "auth-rejected", phoneNumber: "rejected@example.com" },
        createRepository({ ...pendingDoctor, account_status: "rejected" })
      )
    ).resolves.toMatchObject({
      account_status: "rejected",
      redirectTo: "/access-rejected"
    });
  });

  it("requires a pending doctor profile and clinic", async () => {
    await expect(
      getPendingApprovalStatusForUser(
        { uid: "missing-profile", phoneNumber: "missing@example.com" },
        createRepository(null)
      )
    ).rejects.toMatchObject({ code: "PROFILE_NOT_FOUND" });

    await expect(
      getPendingApprovalStatusForUser(
        { uid: "missing-clinic", phoneNumber: "missing@example.com" },
        createRepository({ ...pendingDoctor, clinic_id: null })
      )
    ).rejects.toMatchObject({ code: "CLINIC_REQUIRED" });
  });
});
