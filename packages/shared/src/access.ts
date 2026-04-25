import type { Doctor } from "./schemas.js";

export class AccessError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "AUTH_REQUIRED"
      | "ACCOUNT_INACTIVE"
      | "OWNER_REQUIRED"
      | "CLINIC_SCOPE_REQUIRED"
      | "SELF_REMOVAL_FORBIDDEN"
  ) {
    super(message);
    this.name = "AccessError";
  }
}

export function assertActiveDoctor(doctor: Doctor | null | undefined): Doctor {
  if (!doctor) {
    throw new AccessError("Authentication is required.", "AUTH_REQUIRED");
  }

  if (doctor.account_status !== "active") {
    throw new AccessError("Doctor account is not active.", "ACCOUNT_INACTIVE");
  }

  return doctor;
}

export function assertOwner(doctor: Doctor): Doctor {
  assertActiveDoctor(doctor);

  if (doctor.role !== "owner") {
    throw new AccessError("Hospital owner access is required.", "OWNER_REQUIRED");
  }

  return doctor;
}

export function assertClinicScope(doctor: Doctor, clinicId: string): Doctor {
  assertActiveDoctor(doctor);

  if (!doctor.clinic_id || doctor.clinic_id !== clinicId) {
    throw new AccessError("Requested resource is outside the doctor's hospital.", "CLINIC_SCOPE_REQUIRED");
  }

  return doctor;
}

export function assertCanRemoveDoctor(owner: Doctor, targetDoctorId: string): void {
  assertOwner(owner);

  if (owner.id === targetDoctorId) {
    throw new AccessError("Hospital owner cannot remove themself.", "SELF_REMOVAL_FORBIDDEN");
  }
}
