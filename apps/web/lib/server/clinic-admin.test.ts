import { describe, expect, it, vi } from "vitest";
import type { Doctor } from "@bharatdoc/shared";
import {
  approveJoinRequestForOwner,
  listPendingApprovalsForOwner,
  rejectJoinRequestForOwner,
  type ClinicAdminRepository
} from "@/lib/server/clinic-admin";

const owner: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-owner",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "owner",
  account_status: "active",
  name: "Dr. Kavita Rao",
  specialization: "Pediatrician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

function createRepository(doctor: Doctor | null = owner): ClinicAdminRepository {
  return {
    findDoctorByFirebaseUid: vi.fn(async () => doctor),
    listPendingApprovals: vi.fn(async () => [
      {
        id: "44444444-4444-4444-8444-444444444444",
        requested_at: "2026-04-23T09:14:00.000Z",
        doctor: {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Dr. Meera Shah",
          specialization: "Pediatrician",
          phone: "+919834012340",
          created_at: "2026-04-23T09:14:00.000Z"
        }
      }
    ]),
    findJoinRequestForClinic: vi.fn(async () => ({
      id: "44444444-4444-4444-8444-444444444444",
      clinic_id: owner.clinic_id!,
      doctor_id: "33333333-3333-4333-8333-333333333333",
      status: "pending" as const
    })),
    approveJoinRequest: vi.fn(async () => undefined),
    rejectJoinRequest: vi.fn(async () => undefined)
  };
}

describe("clinic admin approvals", () => {
  it("lists pending approvals for active owners", async () => {
    const repository = createRepository();

    await expect(listPendingApprovalsForOwner({ uid: "firebase-owner", phoneNumber: "+919876543210" }, repository)).resolves.toHaveLength(1);
    expect(repository.listPendingApprovals).toHaveBeenCalledWith(owner.clinic_id);
  });

  it("blocks non-owner doctors", async () => {
    const repository = createRepository({ ...owner, role: "doctor" });

    await expect(
      listPendingApprovalsForOwner({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).rejects.toThrow("Clinic owner access is required.");
  });

  it("approves pending join requests within the owner's clinic", async () => {
    const repository = createRepository();

    await expect(
      approveJoinRequestForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        "44444444-4444-4444-8444-444444444444",
        repository
      )
    ).resolves.toEqual({ ok: true });
    expect(repository.approveJoinRequest).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "33333333-3333-4333-8333-333333333333",
      owner.id
    );
  });

  it("rejects pending join requests with a trimmed optional reason", async () => {
    const repository = createRepository();

    await expect(
      rejectJoinRequestForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        "44444444-4444-4444-8444-444444444444",
        "  Not recognised  ",
        repository
      )
    ).resolves.toEqual({ ok: true });
    expect(repository.rejectJoinRequest).toHaveBeenCalledWith(
      "44444444-4444-4444-8444-444444444444",
      "33333333-3333-4333-8333-333333333333",
      owner.id,
      "Not recognised"
    );
  });

  it("does not approve missing or already-reviewed requests", async () => {
    const repository = {
      ...createRepository(),
      findJoinRequestForClinic: vi.fn(async () => null)
    };

    await expect(
      approveJoinRequestForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        "44444444-4444-4444-8444-444444444444",
        repository
      )
    ).rejects.toMatchObject({ code: "JOIN_REQUEST_NOT_FOUND" });
  });
});
