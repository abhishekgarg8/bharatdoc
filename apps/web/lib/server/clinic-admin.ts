import { assertOwner, type Doctor } from "@bharatdoc/shared";
import type { VerifiedUser } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

export interface PendingApprovalDoctor {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  created_at: string;
}

export interface PendingApproval {
  id: string;
  requested_at: string;
  doctor: PendingApprovalDoctor;
}

export interface JoinRequestForReview {
  id: string;
  clinic_id: string;
  doctor_id: string;
  status: "pending" | "approved" | "rejected";
}

export interface ClinicAdminRepository {
  findDoctorByFirebaseUid(firebaseUid: string): Promise<Doctor | null>;
  listPendingApprovals(clinicId: string): Promise<PendingApproval[]>;
  findJoinRequestForClinic(requestId: string, clinicId: string): Promise<JoinRequestForReview | null>;
  approveJoinRequest(requestId: string, doctorId: string, ownerId: string): Promise<void>;
  rejectJoinRequest(requestId: string, doctorId: string, ownerId: string, reason: string | null): Promise<void>;
}

async function requireOwnerContext(user: VerifiedUser, repository: ClinicAdminRepository): Promise<Doctor> {
  const doctor = await repository.findDoctorByFirebaseUid(user.uid);

  if (!doctor) {
    throw new AppError(401, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  assertOwner(doctor);

  if (!doctor.clinic_id) {
    throw new AppError(403, "Owner must belong to a clinic.", "CLINIC_REQUIRED");
  }

  return doctor;
}

export async function listPendingApprovalsForOwner(
  user: VerifiedUser,
  repository: ClinicAdminRepository
): Promise<PendingApproval[]> {
  const owner = await requireOwnerContext(user, repository);
  return repository.listPendingApprovals(owner.clinic_id!);
}

export async function approveJoinRequestForOwner(
  user: VerifiedUser,
  requestId: string,
  repository: ClinicAdminRepository
): Promise<{ ok: true }> {
  const owner = await requireOwnerContext(user, repository);
  const joinRequest = await repository.findJoinRequestForClinic(requestId, owner.clinic_id!);

  if (!joinRequest || joinRequest.status !== "pending") {
    throw new AppError(404, "Pending join request was not found.", "JOIN_REQUEST_NOT_FOUND");
  }

  await repository.approveJoinRequest(joinRequest.id, joinRequest.doctor_id, owner.id);
  return { ok: true };
}

export async function rejectJoinRequestForOwner(
  user: VerifiedUser,
  requestId: string,
  reason: string | null,
  repository: ClinicAdminRepository
): Promise<{ ok: true }> {
  const owner = await requireOwnerContext(user, repository);
  const joinRequest = await repository.findJoinRequestForClinic(requestId, owner.clinic_id!);

  if (!joinRequest || joinRequest.status !== "pending") {
    throw new AppError(404, "Pending join request was not found.", "JOIN_REQUEST_NOT_FOUND");
  }

  await repository.rejectJoinRequest(joinRequest.id, joinRequest.doctor_id, owner.id, reason?.trim() || null);
  return { ok: true };
}
