import { describe, expect, it, vi } from "vitest";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import {
  approveJoinRequestForOwner,
  getClinicAdminSnapshotForOwner,
  listPendingApprovalsForOwner,
  reapproveDoctorForOwner,
  rejectJoinRequestForOwner,
  removeDoctorFromClinicForOwner,
  updateClinicProfileForOwner,
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
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

const clinic: Clinic = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sunrise Clinic",
  clinic_code: "MED42X",
  address: "24 Baner Road, Pune",
  logo_storage_path: null,
  created_at: "2026-04-23T09:00:00.000Z"
};

function createRepository(doctor: Doctor | null = owner): ClinicAdminRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => doctor),
    findClinicById: vi.fn(async () => clinic),
    listActiveDoctors: vi.fn(async () => [
      {
        id: owner.id,
        name: owner.name,
        specialization: owner.specialization,
        phone: owner.phone,
        role: "owner" as const,
        recordings_count: 3,
        created_at: owner.created_at
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Dr. Leena Joshi",
        specialization: "General Physician",
        phone: "+919812345678",
        role: "doctor" as const,
        recordings_count: 2,
        created_at: "2026-04-23T10:00:00.000Z"
      }
    ]),
    listRejectedDoctors: vi.fn(async () => [
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Dr. Sameer Kulkarni",
        specialization: "General Physician",
        phone: "+919800011122",
        role: "doctor" as const,
        account_status: "rejected" as const,
        recordings_count: 1,
        created_at: "2026-04-22T10:00:00.000Z"
      }
    ]),
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
    countRecordingsByDoctorIds: vi.fn(async () => ({
      [owner.id]: 3,
      "55555555-5555-4555-8555-555555555555": 2,
      "66666666-6666-4666-8666-666666666666": 1
    })),
    approveJoinRequest: vi.fn(async () => undefined),
    rejectJoinRequest: vi.fn(async () => undefined),
    updateDoctorAccountStatus: vi.fn(async () => undefined),
    updateClinicProfile: vi.fn(async (_clinicId: string, input) => ({
      ...clinic,
      name: input.name ?? clinic.name,
      clinic_code: input.code ?? clinic.clinic_code,
      address: input.address !== undefined ? input.address : clinic.address
    }))
  };
}

describe("clinic admin approvals", () => {
  it("loads clinic profile, active doctors, and pending approvals for owners", async () => {
    const repository = createRepository();

    await expect(
      getClinicAdminSnapshotForOwner({ uid: "firebase-owner", phoneNumber: "+919876543210" }, repository)
    ).resolves.toMatchObject({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        code: clinic.clinic_code,
        activeDoctorsCount: 2
      },
      activeDoctors: [{ id: owner.id }, { name: "Dr. Leena Joshi" }],
      rejectedDoctors: [{ name: "Dr. Sameer Kulkarni", recordings_count: 1 }],
      pendingApprovals: [{ id: "44444444-4444-4444-8444-444444444444" }]
    });
    expect(repository.countRecordingsByDoctorIds).toHaveBeenCalledWith(clinic.id, [
      owner.id,
      "55555555-5555-4555-8555-555555555555"
    ]);
  });

  it("lists pending approvals for active owners", async () => {
    const repository = createRepository();

    await expect(listPendingApprovalsForOwner({ uid: "firebase-owner", phoneNumber: "+919876543210" }, repository)).resolves.toHaveLength(1);
    expect(repository.listPendingApprovals).toHaveBeenCalledWith(owner.clinic_id);
  });

  it("blocks non-owner doctors", async () => {
    const repository = createRepository({ ...owner, role: "doctor" });

    await expect(
      listPendingApprovalsForOwner({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).rejects.toThrow("Hospital owner access is required.");
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

  it("does not approve join requests outside the owner's clinic", async () => {
    const repository = {
      ...createRepository(),
      findJoinRequestForClinic: vi.fn(async () => null)
    };

    await expect(
      approveJoinRequestForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        "99999999-9999-4999-8999-999999999999",
        repository
      )
    ).rejects.toMatchObject({ code: "JOIN_REQUEST_NOT_FOUND" });
    expect(repository.findJoinRequestForClinic).toHaveBeenCalledWith(
      "99999999-9999-4999-8999-999999999999",
      owner.clinic_id
    );
    expect(repository.approveJoinRequest).not.toHaveBeenCalled();
  });

  it("removes active doctors from the clinic without allowing self-removal", async () => {
    const repository = createRepository();

    await expect(
      removeDoctorFromClinicForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        "55555555-5555-4555-8555-555555555555",
        repository
      )
    ).resolves.toEqual({ ok: true });
    expect(repository.updateDoctorAccountStatus).toHaveBeenCalledWith(
      "55555555-5555-4555-8555-555555555555",
      owner.clinic_id,
      "rejected"
    );

    await expect(
      removeDoctorFromClinicForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        owner.id,
        createRepository()
      )
    ).rejects.toMatchObject({ code: "SELF_REMOVAL_FORBIDDEN" });
  });

  it("re-approves rejected doctors in the owner's clinic", async () => {
    const repository = createRepository();

    await expect(
      reapproveDoctorForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        "66666666-6666-4666-8666-666666666666",
        repository
      )
    ).resolves.toEqual({ ok: true });
    expect(repository.updateDoctorAccountStatus).toHaveBeenCalledWith(
      "66666666-6666-4666-8666-666666666666",
      owner.clinic_id,
      "active"
    );
  });

  it("passes owner clinic scope when removing and re-approving doctors", async () => {
    const repository = createRepository();

    await removeDoctorFromClinicForOwner(
      { uid: "firebase-owner", phoneNumber: "+919876543210" },
      "55555555-5555-4555-8555-555555555555",
      repository
    );
    await reapproveDoctorForOwner(
      { uid: "firebase-owner", phoneNumber: "+919876543210" },
      "66666666-6666-4666-8666-666666666666",
      repository
    );

    expect(repository.updateDoctorAccountStatus).toHaveBeenNthCalledWith(
      1,
      "55555555-5555-4555-8555-555555555555",
      owner.clinic_id,
      "rejected"
    );
    expect(repository.updateDoctorAccountStatus).toHaveBeenNthCalledWith(
      2,
      "66666666-6666-4666-8666-666666666666",
      owner.clinic_id,
      "active"
    );
  });

  it("updates the clinic profile for owners and normalizes empty addresses to null", async () => {
    const repository = createRepository();

    await expect(
      updateClinicProfileForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        {
          name: "Sunrise Family Clinic",
          address: "   "
        },
        repository
      )
    ).resolves.toMatchObject({
      name: "Sunrise Family Clinic",
      address: null,
      code: "MED42X",
      activeDoctorsCount: 2
    });
    expect(repository.updateClinicProfile).toHaveBeenCalledWith(clinic.id, {
      name: "Sunrise Family Clinic",
      address: null
    });
  });

  it("updates the doctor join code for owners and normalizes it to uppercase", async () => {
    const repository = createRepository();

    await expect(
      updateClinicProfileForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        { code: "abc123" },
        repository
      )
    ).resolves.toMatchObject({
      code: "ABC123"
    });
    expect(repository.updateClinicProfile).toHaveBeenCalledWith(clinic.id, {
      code: "ABC123"
    });
  });

  it("rejects invalid doctor join code updates", async () => {
    const repository = createRepository();

    await expect(
      updateClinicProfileForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        { code: "TOOLONG" },
        repository
      )
    ).rejects.toMatchObject({ code: "CLINIC_CODE_INVALID" });
    expect(repository.updateClinicProfile).not.toHaveBeenCalled();
  });

  it("rejects empty clinic profile updates", async () => {
    await expect(
      updateClinicProfileForOwner(
        { uid: "firebase-owner", phoneNumber: "+919876543210" },
        {},
        createRepository()
      )
    ).rejects.toMatchObject({ code: "EMPTY_CLINIC_UPDATE" });
  });
});
