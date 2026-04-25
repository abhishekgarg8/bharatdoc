import { assertOwner, type Clinic, type Doctor } from "@bharatdoc/shared";
import { z } from "zod";
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

export interface ActiveClinicDoctor {
  id: string;
  name: string;
  specialization: string;
  phone: string;
  role: "owner" | "doctor";
  created_at: string;
}

export interface ClinicProfile {
  id: string;
  name: string;
  code: string;
  address: string | null;
  activeDoctorsCount: number;
}

export interface ClinicAdminSnapshot {
  clinic: ClinicProfile;
  activeDoctors: ActiveClinicDoctor[];
  pendingApprovals: PendingApproval[];
}

export interface ClinicProfileUpdate {
  name?: string;
  address?: string | null;
}

export interface JoinRequestForReview {
  id: string;
  clinic_id: string;
  doctor_id: string;
  status: "pending" | "approved" | "rejected";
}

export interface ClinicAdminRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  findClinicById(clinicId: string): Promise<Clinic | null>;
  listActiveDoctors(clinicId: string): Promise<ActiveClinicDoctor[]>;
  listPendingApprovals(clinicId: string): Promise<PendingApproval[]>;
  findJoinRequestForClinic(requestId: string, clinicId: string): Promise<JoinRequestForReview | null>;
  approveJoinRequest(requestId: string, doctorId: string, ownerId: string): Promise<void>;
  rejectJoinRequest(requestId: string, doctorId: string, ownerId: string, reason: string | null): Promise<void>;
  updateClinicProfile(clinicId: string, input: ClinicProfileUpdate): Promise<Clinic>;
}

const ClinicProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    address: z.string().trim().optional().nullable()
  })
  .strict();

function toClinicProfile(clinic: Clinic, activeDoctorsCount: number): ClinicProfile {
  return {
    id: clinic.id,
    name: clinic.name,
    code: clinic.clinic_code,
    address: clinic.address,
    activeDoctorsCount
  };
}

function normalizeAddress(address: string | null | undefined): string | null | undefined {
  if (address === undefined) {
    return undefined;
  }

  if (address === null) {
    return null;
  }

  const normalized = address.trim();
  return normalized ? normalized : null;
}

async function requireOwnerContext(user: VerifiedUser, repository: ClinicAdminRepository): Promise<Doctor> {
  const doctor = await repository.findDoctorByAuthUid(user.uid);

  if (!doctor) {
    throw new AppError(401, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  assertOwner(doctor);

  if (!doctor.clinic_id) {
    throw new AppError(403, "Owner must belong to a hospital.", "CLINIC_REQUIRED");
  }

  return doctor;
}

async function requireOwnerClinic(user: VerifiedUser, repository: ClinicAdminRepository): Promise<Clinic> {
  const owner = await requireOwnerContext(user, repository);
  const clinic = await repository.findClinicById(owner.clinic_id!);

  if (!clinic) {
    throw new AppError(404, "Hospital profile was not found.", "CLINIC_NOT_FOUND");
  }

  return clinic;
}

export async function getClinicAdminSnapshotForOwner(
  user: VerifiedUser,
  repository: ClinicAdminRepository
): Promise<ClinicAdminSnapshot> {
  const clinic = await requireOwnerClinic(user, repository);
  const [activeDoctors, pendingApprovals] = await Promise.all([
    repository.listActiveDoctors(clinic.id),
    repository.listPendingApprovals(clinic.id)
  ]);

  return {
    clinic: toClinicProfile(clinic, activeDoctors.length),
    activeDoctors,
    pendingApprovals
  };
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

export async function updateClinicProfileForOwner(
  user: VerifiedUser,
  input: unknown,
  repository: ClinicAdminRepository
): Promise<ClinicProfile> {
  const clinic = await requireOwnerClinic(user, repository);
  const parsed = ClinicProfileUpdateSchema.parse(input);
  const update: ClinicProfileUpdate = {};

  if (parsed.name !== undefined) {
    update.name = parsed.name;
  }

  if ("address" in parsed) {
    const address = normalizeAddress(parsed.address);

    if (address !== undefined) {
      update.address = address;
    }
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(400, "No hospital fields were provided.", "EMPTY_CLINIC_UPDATE");
  }

  const updatedClinic = await repository.updateClinicProfile(clinic.id, update);
  const activeDoctors = await repository.listActiveDoctors(clinic.id);

  return toClinicProfile(updatedClinic, activeDoctors.length);
}
