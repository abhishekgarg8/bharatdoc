import {
  type Clinic,
  type Doctor,
  type ProfileInput,
  RegistrationInputSchema,
  generateClinicCode
} from "@bharatdoc/shared";
import { AppError } from "@/lib/server/errors";
import type { VerifiedUser } from "@/lib/server/auth";

export interface PendingJoinRequest {
  id: string;
  clinic_id: string;
  doctor_id: string;
  status: "pending" | "approved" | "rejected";
}

export class ExistingDoctorAccountError extends Error {
  constructor(public readonly doctor: Doctor) {
    super("Doctor account already exists.");
    this.name = "ExistingDoctorAccountError";
  }
}

export interface OnboardingRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  listHospitals(): Promise<Clinic[]>;
  findClinicById(clinicId: string): Promise<Clinic | null>;
  findClinicByCode(clinicCode: string): Promise<Clinic | null>;
  createOwner(input: {
    authUid: string;
    phone: string;
    profile: ProfileInput;
    hospital: {
      name: string;
      address?: string | undefined;
      logo_storage_path?: string | undefined;
    };
    clinicCode: string;
  }): Promise<{ doctor: Doctor; clinic: Clinic }>;
  createDoctorJoinRequest(input: {
    authUid: string;
    phone: string;
    profile: ProfileInput;
    clinic: Clinic;
  }): Promise<{ doctor: Doctor; clinic: Clinic; joinRequest: PendingJoinRequest }>;
}

export interface HospitalOption {
  hospital_id: string;
  hospital_name: string;
  hospital_address: string | null;
}

export interface ClinicLookupResult {
  clinic_id: string;
  clinic_name: string;
  clinic_address: string | null;
}

export type RegistrationResult =
  | {
      status: "active";
      role: "owner";
      doctor: Doctor;
      clinic: Clinic;
    }
  | {
      status: "pending_approval";
      role: "doctor";
      doctor: Doctor;
      clinic: Clinic;
      joinRequest: PendingJoinRequest;
    }
  | {
      status: "existing_account";
      role: "owner" | "doctor";
      account_status: "pending_approval" | "active" | "rejected";
      doctor: Doctor;
    };

export async function lookupClinicByCode(
  clinicCode: string,
  repository: Pick<OnboardingRepository, "findClinicByCode">
): Promise<ClinicLookupResult> {
  const clinic = await repository.findClinicByCode(clinicCode.trim().toUpperCase());

  if (!clinic) {
    throw new AppError(404, "Hospital code was not found.", "CLINIC_NOT_FOUND");
  }

  return {
    clinic_id: clinic.id,
    clinic_name: clinic.name,
    clinic_address: clinic.address
  };
}

function toHospitalOption(clinic: Clinic): HospitalOption {
  return {
    hospital_id: clinic.id,
    hospital_name: clinic.name,
    hospital_address: clinic.address
  };
}

export async function listHospitalsForOnboarding(
  repository: Pick<OnboardingRepository, "listHospitals">
): Promise<HospitalOption[]> {
  const hospitals = await repository.listHospitals();
  return hospitals.map(toHospitalOption);
}

export async function registerDoctorAccount(
  input: unknown,
  user: VerifiedUser,
  repository: OnboardingRepository
): Promise<RegistrationResult> {
  const registrationInput = RegistrationInputSchema.parse(input);
  const existingDoctor = await repository.findDoctorByAuthUid(user.uid);

  if (existingDoctor) {
    return {
      status: "existing_account",
      role: existingDoctor.role,
      account_status: existingDoctor.account_status,
      doctor: existingDoctor
    };
  }

  if (registrationInput.mode === "create_hospital" || registrationInput.mode === "create_clinic") {
    const hospital = "hospital" in registrationInput ? registrationInput.hospital : registrationInput.clinic;
    const result = await createAccountOrReturnExisting(
      () =>
        repository.createOwner({
          authUid: user.uid,
          phone: user.phoneNumber,
          profile: registrationInput.profile,
          hospital,
          clinicCode: generateClinicCode()
        }),
      repository,
      user.uid
    );

    if ("existingDoctor" in result) {
      return existingAccountResult(result.existingDoctor);
    }

    return {
      status: "active",
      role: "owner",
      ...result
    };
  }

  const clinic =
    registrationInput.mode === "join_hospital"
      ? await repository.findClinicById(registrationInput.hospital_id)
      : await repository.findClinicByCode(registrationInput.clinic_code);

  if (!clinic) {
    throw new AppError(404, "Hospital was not found.", "CLINIC_NOT_FOUND");
  }

  const result = await createAccountOrReturnExisting(
    () =>
      repository.createDoctorJoinRequest({
        authUid: user.uid,
        phone: user.phoneNumber,
        profile: registrationInput.profile,
        clinic
      }),
    repository,
    user.uid
  );

  if ("existingDoctor" in result) {
    return existingAccountResult(result.existingDoctor);
  }

  return {
    status: "pending_approval",
    role: "doctor",
    ...result
  };
}

function existingAccountResult(doctor: Doctor): Extract<RegistrationResult, { status: "existing_account" }> {
  return {
    status: "existing_account",
    role: doctor.role,
    account_status: doctor.account_status,
    doctor
  };
}

async function createAccountOrReturnExisting<T>(
  create: () => Promise<T>,
  repository: Pick<OnboardingRepository, "findDoctorByAuthUid">,
  authUid: string
): Promise<T | { existingDoctor: Doctor }> {
  try {
    return await create();
  } catch (error) {
    if (error instanceof ExistingDoctorAccountError) {
      return { existingDoctor: error.doctor };
    }

    if (isDuplicateDoctorAuthError(error)) {
      const existingDoctor = await repository.findDoctorByAuthUid(authUid);

      if (existingDoctor) {
        return { existingDoctor };
      }
    }

    throw error;
  }
}

function isDuplicateDoctorAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const fields = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return candidate.code === "23505" && fields.includes("doctors") && fields.includes("firebase_uid");
}
