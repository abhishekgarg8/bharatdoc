import type { Clinic, Doctor } from "@bharatdoc/shared";
import type { VerifiedUser } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

export interface PendingApprovalOwner {
  id: string;
  name: string;
}

export interface PendingApprovalJoinRequest {
  id: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
}

export interface PendingApprovalClinic {
  id: string;
  name: string;
  code: string;
  address: string | null;
}

export interface PendingApprovalContext {
  account_status: "pending_approval";
  doctor: Doctor;
  clinic: PendingApprovalClinic;
  owner: PendingApprovalOwner | null;
  join_request: PendingApprovalJoinRequest | null;
}

export interface PendingApprovalRedirect {
  account_status: "active" | "rejected";
  doctor: Doctor;
  redirectTo: "/dashboard" | "/access-rejected";
}

export type PendingApprovalStatus = PendingApprovalContext | PendingApprovalRedirect;

export interface PendingApprovalRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  findClinicById(clinicId: string): Promise<Clinic | null>;
  findActiveOwnerForClinic(clinicId: string): Promise<PendingApprovalOwner | null>;
  findPendingJoinRequestForDoctor(doctorId: string, clinicId: string): Promise<PendingApprovalJoinRequest | null>;
}

function toPendingClinic(clinic: Clinic): PendingApprovalClinic {
  return {
    id: clinic.id,
    name: clinic.name,
    code: clinic.clinic_code,
    address: clinic.address
  };
}

export async function getPendingApprovalStatusForUser(
  user: VerifiedUser,
  repository: PendingApprovalRepository
): Promise<PendingApprovalStatus> {
  const doctor = await repository.findDoctorByAuthUid(user.uid);

  if (!doctor) {
    throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  if (doctor.account_status === "active") {
    return {
      account_status: "active",
      doctor,
      redirectTo: "/dashboard"
    };
  }

  if (doctor.account_status === "rejected") {
    return {
      account_status: "rejected",
      doctor,
      redirectTo: "/access-rejected"
    };
  }

  if (!doctor.clinic_id) {
    throw new AppError(403, "Pending doctor must belong to a hospital.", "CLINIC_REQUIRED");
  }

  const clinic = await repository.findClinicById(doctor.clinic_id);

  if (!clinic) {
    throw new AppError(404, "Hospital profile was not found.", "CLINIC_NOT_FOUND");
  }

  const [owner, joinRequest] = await Promise.all([
    repository.findActiveOwnerForClinic(clinic.id),
    repository.findPendingJoinRequestForDoctor(doctor.id, clinic.id)
  ]);

  return {
    account_status: "pending_approval",
    doctor,
    clinic: toPendingClinic(clinic),
    owner,
    join_request: joinRequest
  };
}
