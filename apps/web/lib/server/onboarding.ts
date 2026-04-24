import {
  type Clinic,
  type Doctor,
  RegistrationInputSchema,
  type RegistrationInput,
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

export interface OnboardingRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  findClinicByCode(clinicCode: string): Promise<Clinic | null>;
  createOwner(input: {
    authUid: string;
    phone: string;
    profile: RegistrationInput & { mode: "create_clinic" };
    clinicCode: string;
  }): Promise<{ doctor: Doctor; clinic: Clinic }>;
  createDoctorJoinRequest(input: {
    authUid: string;
    phone: string;
    profile: RegistrationInput & { mode: "join_clinic" };
    clinic: Clinic;
  }): Promise<{ doctor: Doctor; clinic: Clinic; joinRequest: PendingJoinRequest }>;
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
    throw new AppError(404, "Clinic code was not found.", "CLINIC_NOT_FOUND");
  }

  return {
    clinic_id: clinic.id,
    clinic_name: clinic.name,
    clinic_address: clinic.address
  };
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

  if (registrationInput.mode === "create_clinic") {
    const result = await repository.createOwner({
      authUid: user.uid,
      phone: user.phoneNumber,
      profile: registrationInput,
      clinicCode: generateClinicCode()
    });

    return {
      status: "active",
      role: "owner",
      ...result
    };
  }

  const clinic = await repository.findClinicByCode(registrationInput.clinic_code);

  if (!clinic) {
    throw new AppError(404, "Clinic code was not found.", "CLINIC_NOT_FOUND");
  }

  const result = await repository.createDoctorJoinRequest({
    authUid: user.uid,
    phone: user.phoneNumber,
    profile: registrationInput,
    clinic
  });

  return {
    status: "pending_approval",
    role: "doctor",
    ...result
  };
}
