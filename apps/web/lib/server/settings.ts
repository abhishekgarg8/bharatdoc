import {
  assertActiveDoctor,
  TranscriptionLanguageSchema,
  validateSummaryPrompt,
  type Doctor,
  type TranscriptionLanguage
} from "@bharatdoc/shared";
import { z } from "zod";
import type { VerifiedUser } from "@/lib/server/auth";
import { AppError } from "@/lib/server/errors";

export interface DoctorPreferences {
  custom_prompt: string | null;
  transcription_lang: TranscriptionLanguage;
}

export interface DoctorPreferencesBootstrap {
  doctor: Doctor;
  preferences: DoctorPreferences | null;
}

export interface DoctorSettingsUpdateResult {
  doctor: Doctor;
  preferences: DoctorPreferences;
}

export interface DoctorPreferencesUpdate {
  custom_prompt?: string | null;
  transcription_lang?: TranscriptionLanguage;
  name?: string;
  specialization?: string;
}

export interface DoctorPreferencesRepository {
  findDoctorByAuthUid(authUid: string): Promise<Doctor | null>;
  updateDoctorPreferences(doctorId: string, input: DoctorPreferencesUpdate): Promise<Doctor>;
}

const DoctorPreferencesUpdateSchema = z
  .object({
    custom_prompt: z.string().nullable().optional(),
    transcription_lang: TranscriptionLanguageSchema.optional(),
    name: z.string().trim().min(1).optional(),
    specialization: z.string().trim().min(1).optional()
  })
  .strict();

function toPreferences(doctor: Doctor): DoctorPreferences {
  return {
    custom_prompt: doctor.custom_prompt,
    transcription_lang: doctor.transcription_lang
  };
}

function normalizePrompt(prompt: string | null | undefined): string | null | undefined {
  if (prompt === undefined) {
    return undefined;
  }

  if (prompt === null) {
    return null;
  }

  const validation = validateSummaryPrompt(prompt);

  if (!validation.ok) {
    throw new AppError(400, "Summary prompt is invalid.", validation.reason.toUpperCase());
  }

  return validation.prompt;
}

async function requireActiveDoctorForSettings(
  user: VerifiedUser,
  repository: DoctorPreferencesRepository
): Promise<Doctor> {
  const doctor = await repository.findDoctorByAuthUid(user.uid);

  if (!doctor) {
    throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  return assertActiveDoctor(doctor);
}

export async function getDoctorPreferencesForUser(
  user: VerifiedUser,
  repository: DoctorPreferencesRepository
): Promise<DoctorPreferences> {
  const doctor = await requireActiveDoctorForSettings(user, repository);
  return toPreferences(doctor);
}

export async function getDoctorPreferencesBootstrapForUser(
  user: VerifiedUser,
  repository: DoctorPreferencesRepository
): Promise<DoctorPreferencesBootstrap> {
  const doctor = await repository.findDoctorByAuthUid(user.uid);

  if (!doctor) {
    throw new AppError(404, "Doctor profile has not been created.", "PROFILE_NOT_FOUND");
  }

  if (doctor.account_status !== "active") {
    return { doctor, preferences: null };
  }

  return {
    doctor,
    preferences: toPreferences(assertActiveDoctor(doctor))
  };
}

export async function updateDoctorPreferencesForUser(
  user: VerifiedUser,
  input: unknown,
  repository: DoctorPreferencesRepository
): Promise<DoctorSettingsUpdateResult> {
  const doctor = await requireActiveDoctorForSettings(user, repository);
  const parsed = DoctorPreferencesUpdateSchema.parse(input);
  const update: DoctorPreferencesUpdate = {};

  if ("custom_prompt" in parsed) {
    const customPrompt = normalizePrompt(parsed.custom_prompt);

    if (customPrompt !== undefined) {
      update.custom_prompt = customPrompt;
    }
  }

  if (parsed.transcription_lang !== undefined) {
    update.transcription_lang = parsed.transcription_lang;
  }

  if (parsed.name !== undefined) {
    update.name = parsed.name;
  }

  if (parsed.specialization !== undefined) {
    update.specialization = parsed.specialization;
  }

  if (Object.keys(update).length === 0) {
    throw new AppError(400, "No preferences were provided.", "EMPTY_PREFERENCES_UPDATE");
  }

  const updatedDoctor = await repository.updateDoctorPreferences(doctor.id, update);
  return {
    doctor: updatedDoctor,
    preferences: toPreferences(updatedDoctor)
  };
}
