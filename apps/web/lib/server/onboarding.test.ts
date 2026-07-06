import { describe, expect, it, vi } from "vitest";
import type { Clinic, Doctor } from "@bharatdoc/shared";
import {
  ExistingDoctorAccountError,
  lookupClinicByCode,
  registerDoctorAccount,
  type OnboardingRepository
} from "@/lib/server/onboarding";

const clinic: Clinic = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sunrise Clinic",
  clinic_code: "MED42X",
  address: "24 Baner Road, Pune",
  logo_storage_path: null,
  created_at: "2026-04-23T09:00:00.000Z"
};

const pgimerClinic: Clinic = {
  ...clinic,
  id: "55555555-5555-4555-8555-555555555555",
  name: "Postgraduate Institute of Medical Education & Research, Chandigarh",
  clinic_code: "PGIMER",
  address: "Sector-12, Chandigarh PIN-160012, India"
};

const activeOwner: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-owner",
  clinic_id: clinic.id,
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

function createRepository(overrides: Partial<OnboardingRepository> = {}): OnboardingRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => null),
    listHospitals: vi.fn(async () => [clinic]),
    findClinicById: vi.fn(async () => clinic),
    findClinicByCode: vi.fn(async () => clinic),
    createOwner: vi.fn(async ({ authUid, phone, profile, hospital, clinicCode }) => ({
      clinic: { ...clinic, clinic_code: clinicCode, name: hospital.name },
      doctor: {
        ...activeOwner,
        firebase_uid: authUid,
        phone,
        name: profile.name,
        specialization: profile.specialization
      }
    })),
    createDoctorJoinRequest: vi.fn(async ({ authUid, phone, profile }) => ({
      clinic,
      doctor: {
        ...activeOwner,
        id: "33333333-3333-4333-8333-333333333333",
        firebase_uid: authUid,
        phone,
        role: "doctor" as const,
        account_status: "pending_approval" as const,
        name: profile.name,
        specialization: profile.specialization
      },
      joinRequest: {
        id: "44444444-4444-4444-8444-444444444444",
        clinic_id: clinic.id,
        doctor_id: "33333333-3333-4333-8333-333333333333",
        status: "pending" as const
      }
    })),
    ...overrides
  };
}

describe("clinic lookup", () => {
  it("normalizes clinic codes and returns confirmation fields", async () => {
    const repository = createRepository();

    await expect(lookupClinicByCode(" med42x ", repository)).resolves.toEqual({
      clinic_id: clinic.id,
      clinic_name: "Sunrise Clinic",
      clinic_address: "24 Baner Road, Pune"
    });
    expect(repository.findClinicByCode).toHaveBeenCalledWith("MED42X");
  });

  it("fails when the clinic code is unknown", async () => {
    await expect(lookupClinicByCode("UNKNOWN", createRepository({ findClinicByCode: vi.fn(async () => null) }))).rejects.toMatchObject({
      code: "CLINIC_NOT_FOUND",
      status: 404
    });
  });
});

describe("doctor registration", () => {
  it("creates an active owner account for a new clinic", async () => {
    const repository = createRepository();
    const result = await registerDoctorAccount(
      {
        mode: "create_clinic",
        profile: { name: "Dr. Kavita Rao", specialization: "Pediatrician" },
        clinic: { name: "Sunrise Clinic", address: "24 Baner Road, Pune" }
      },
      { uid: "firebase-owner", phoneNumber: "+919876543210" },
      repository
    );

    expect(result.status).toBe("active");
    expect(result.role).toBe("owner");
    expect(repository.createOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        authUid: "firebase-owner",
        phone: "+919876543210",
        clinicCode: expect.stringMatching(/^[A-Z2-9]{6}$/)
      })
    );
  });

  it("creates a pending doctor account and join request for existing clinics", async () => {
    const repository = createRepository();
    const result = await registerDoctorAccount(
      {
        mode: "join_clinic",
        profile: { name: "Dr. Aparna Iyer", specialization: "General Physician" },
        clinic_code: "MED42X"
      },
      { uid: "firebase-doctor", phoneNumber: "+919800000000" },
      repository
    );

    expect(result.status).toBe("pending_approval");
    expect(result.role).toBe("doctor");
    expect(repository.createDoctorJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        authUid: "firebase-doctor",
        phone: "+919800000000",
        clinic,
        autoApprove: false
      })
    );
  });

  it("creates an active doctor account for normalized PGIMER clinic-code joins", async () => {
    const repository = createRepository({
      findClinicByCode: vi.fn(async () => pgimerClinic),
      createDoctorJoinRequest: vi.fn(async ({ authUid, phone, profile, clinic: selectedClinic, autoApprove }) => ({
        clinic: selectedClinic,
        doctor: {
          ...activeOwner,
          id: "66666666-6666-4666-8666-666666666666",
          firebase_uid: authUid,
          clinic_id: selectedClinic.id,
          phone,
          role: "doctor" as const,
          account_status: autoApprove ? ("active" as const) : ("pending_approval" as const),
          name: profile.name,
          specialization: profile.specialization
        },
        joinRequest: {
          id: "77777777-7777-4777-8777-777777777777",
          clinic_id: selectedClinic.id,
          doctor_id: "66666666-6666-4666-8666-666666666666",
          status: autoApprove ? ("approved" as const) : ("pending" as const)
        }
      }))
    });

    const result = await registerDoctorAccount(
      {
        mode: "join_clinic",
        profile: { name: "Dr. PGIMER Pilot", specialization: "Internal Medicine" },
        clinic_code: " pgimer "
      },
      { uid: "firebase-pgimer", phoneNumber: "+919800000001" },
      repository
    );

    expect(result.status).toBe("active");
    expect(result.role).toBe("doctor");
    expect(repository.findClinicByCode).toHaveBeenCalledWith("PGIMER");
    expect(repository.createDoctorJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic: pgimerClinic,
        autoApprove: true
      })
    );
  });

  it("keeps PGIMER hospital-id joins in the manual approval flow", async () => {
    const repository = createRepository({
      findClinicById: vi.fn(async () => pgimerClinic)
    });

    const result = await registerDoctorAccount(
      {
        mode: "join_hospital",
        profile: { name: "Dr. PGIMER Pilot", specialization: "Internal Medicine" },
        hospital_id: pgimerClinic.id
      },
      { uid: "firebase-pgimer", phoneNumber: "+919800000001" },
      repository
    );

    expect(result.status).toBe("pending_approval");
    expect(repository.createDoctorJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic: pgimerClinic,
        autoApprove: false
      })
    );
  });

  it("returns existing account state without creating duplicate rows", async () => {
    const repository = createRepository({
      findDoctorByAuthUid: vi.fn(async () => activeOwner)
    });

    const result = await registerDoctorAccount(
      {
        mode: "create_clinic",
        profile: { name: "Ignored", specialization: "Ignored" },
        clinic: { name: "Ignored" }
      },
      { uid: "firebase-owner", phoneNumber: "+919876543210" },
      repository
    );

    expect(result).toMatchObject({
      status: "existing_account",
      role: "owner",
      account_status: "active"
    });
    expect(repository.createOwner).not.toHaveBeenCalled();
    expect(repository.createDoctorJoinRequest).not.toHaveBeenCalled();
  });

  it("returns existing account state when the owner creation RPC detects a duplicate submit", async () => {
    const repository = createRepository({
      createOwner: vi.fn(async () => {
        throw new ExistingDoctorAccountError(activeOwner);
      })
    });

    const result = await registerDoctorAccount(
      {
        mode: "create_clinic",
        profile: { name: "Dr. Kavita Rao", specialization: "Pediatrician" },
        clinic: { name: "Sunrise Clinic" }
      },
      { uid: "firebase-owner", phoneNumber: "+919876543210" },
      repository
    );

    expect(result).toMatchObject({
      status: "existing_account",
      role: "owner",
      account_status: "active",
      doctor: activeOwner
    });
  });

  it("recovers existing account state when a database unique constraint wins a race", async () => {
    const duplicateError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "doctors_firebase_uid_key"',
      details: "Key (firebase_uid)=(firebase-owner) already exists."
    };
    const repository = createRepository({
      createOwner: vi.fn(async () => {
        throw duplicateError;
      }),
      findDoctorByAuthUid: vi.fn(async () => activeOwner)
    });

    const result = await registerDoctorAccount(
      {
        mode: "create_clinic",
        profile: { name: "Dr. Kavita Rao", specialization: "Pediatrician" },
        clinic: { name: "Sunrise Clinic" }
      },
      { uid: "firebase-owner", phoneNumber: "+919876543210" },
      repository
    );

    expect(result).toMatchObject({
      status: "existing_account",
      role: "owner",
      account_status: "active",
      doctor: activeOwner
    });
    expect(repository.findDoctorByAuthUid).toHaveBeenCalledWith("firebase-owner");
  });

  it("does not accept spoofed auth UID or phone values from request bodies", async () => {
    const repository = createRepository();

    await registerDoctorAccount(
      {
        mode: "join_clinic",
        firebase_uid: "spoofed",
        phone: "+910000000000",
        profile: { name: "Dr. Aparna Iyer", specialization: "General Physician" },
        clinic_code: "MED42X"
      },
      { uid: "verified-firebase", phoneNumber: "+919876543210" },
      repository
    );

    expect(repository.createDoctorJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        authUid: "verified-firebase",
        phone: "+919876543210"
      })
    );
  });

  it("drops legacy medical registration values before creating rows", async () => {
    const repository = createRepository();

    await registerDoctorAccount(
      {
        mode: "join_clinic",
        profile: {
          name: "Dr. Aparna Iyer",
          specialization: "General Physician",
          medical_reg_no: "MCI-MH-45231"
        },
        clinic_code: "MED42X"
      },
      { uid: "verified-firebase", phoneNumber: "+919876543210" },
      repository
    );

    expect(repository.createDoctorJoinRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: {
          name: "Dr. Aparna Iyer",
          specialization: "General Physician"
        }
      })
    );
  });
});
