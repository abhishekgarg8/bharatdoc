import { z } from "zod";
import {
  ACCOUNT_STATUSES,
  DOCTOR_ROLES,
  JOIN_REQUEST_STATUSES,
  RECORDING_STATUSES,
  TRANSCRIPTION_LANGUAGES
} from "./constants.js";
import { normalizeClinicCode } from "./clinic-code.js";

export const UuidSchema = z.string().uuid();
export const PhoneSchema = z.string().min(8).max(20);
export const ClinicCodeSchema = z.string().transform(normalizeClinicCode).pipe(z.string().length(6));
export const DoctorRoleSchema = z.enum(DOCTOR_ROLES);
export const AccountStatusSchema = z.enum(ACCOUNT_STATUSES);
export const JoinRequestStatusSchema = z.enum(JOIN_REQUEST_STATUSES);
export const RecordingStatusSchema = z.enum(RECORDING_STATUSES);
export const TranscriptionLanguageSchema = z.enum(TRANSCRIPTION_LANGUAGES);
export const TranscriptionSessionFinalizeRequestSchema = z.strictObject({});
export const TranscriptionSessionFinalizationSchema = z.strictObject({
  recording_id: UuidSchema,
  session_id: UuidSchema,
  status: z.literal("transcribed"),
  transcript_hash: z.string().regex(/^[a-f0-9]{64}$/),
  generation: z.number().int().positive(),
  finalized_at: z.iso.datetime({ offset: true })
});

export const ClinicSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1),
  clinic_code: ClinicCodeSchema,
  address: z.string().nullable(),
  logo_storage_path: z.string().nullable(),
  created_at: z.string().datetime()
});

export const DoctorSchema = z.object({
  id: UuidSchema,
  firebase_uid: z.string().min(1),
  clinic_id: UuidSchema.nullable(),
  role: DoctorRoleSchema,
  account_status: AccountStatusSchema,
  name: z.string().min(1),
  specialization: z.string().min(1),
  phone: PhoneSchema,
  profile_photo_path: z.string().nullable(),
  custom_prompt: z.string().nullable(),
  transcription_lang: TranscriptionLanguageSchema,
  created_at: z.string().datetime()
});

export const RecordingSchema = z.object({
  id: UuidSchema,
  doctor_id: UuidSchema,
  clinic_id: UuidSchema,
  patient_id: z.string().nullable(),
  label: z.string().nullable(),
  duration_seconds: z.number().int().nonnegative().nullable(),
  audio_storage_path: z.string().nullable(),
  transcript: z.string().nullable(),
  summary: z.string().nullable(),
  pdf_storage_path: z.string().nullable(),
  pdf_generated_at: z.string().datetime().nullable(),
  pdf_version: z.string().nullable(),
  ai_provenance: z.record(z.string(), z.unknown()).nullable().optional(),
  status: RecordingStatusSchema,
  recorded_at: z.string().datetime(),
  created_at: z.string().datetime()
});

export const OwnerRegistrationSchema = z.object({
  firebase_uid: z.string().min(1),
  phone: PhoneSchema,
  name: z.string().min(1),
  specialization: z.string().min(1),
  profile_photo_path: z.string().optional(),
  clinic_name: z.string().min(1),
  clinic_address: z.string().optional(),
  clinic_logo_path: z.string().optional()
});

export const DoctorRegistrationSchema = z.object({
  firebase_uid: z.string().min(1),
  phone: PhoneSchema,
  name: z.string().min(1),
  specialization: z.string().min(1),
  profile_photo_path: z.string().optional(),
  clinic_id: UuidSchema
});

export const ProfileInputSchema = z.object({
  name: z.string().trim().min(1),
  specialization: z.string().trim().min(1),
  profile_photo_path: z.string().trim().optional()
});

export const CreateClinicRegistrationInputSchema = z.object({
  mode: z.literal("create_clinic"),
  profile: ProfileInputSchema,
  clinic: z.object({
    name: z.string().trim().min(1),
    address: z.string().trim().optional(),
    logo_storage_path: z.string().trim().optional()
  })
});

export const JoinClinicRegistrationInputSchema = z.object({
  mode: z.literal("join_clinic"),
  profile: ProfileInputSchema,
  clinic_code: ClinicCodeSchema
});

export const CreateHospitalRegistrationInputSchema = z.object({
  mode: z.literal("create_hospital"),
  profile: ProfileInputSchema,
  hospital: z.object({
    name: z.string().trim().min(1),
    address: z.string().trim().optional(),
    logo_storage_path: z.string().trim().optional()
  })
});

export const JoinHospitalRegistrationInputSchema = z.object({
  mode: z.literal("join_hospital"),
  profile: ProfileInputSchema,
  hospital_id: UuidSchema
});

export const RegistrationInputSchema = z.discriminatedUnion("mode", [
  CreateHospitalRegistrationInputSchema,
  JoinHospitalRegistrationInputSchema,
  CreateClinicRegistrationInputSchema,
  JoinClinicRegistrationInputSchema
]);

export const RecordingCreateSchema = z.object({
  id: UuidSchema,
  patient_id: z.string().optional().nullable(),
  label: z.string().optional().nullable(),
  duration_seconds: z.number().int().nonnegative(),
  recorded_at: z.string().datetime()
});

export type Clinic = z.infer<typeof ClinicSchema>;
export type Doctor = z.infer<typeof DoctorSchema>;
export type Recording = z.infer<typeof RecordingSchema>;
export type OwnerRegistration = z.infer<typeof OwnerRegistrationSchema>;
export type DoctorRegistration = z.infer<typeof DoctorRegistrationSchema>;
export type ProfileInput = z.infer<typeof ProfileInputSchema>;
export type CreateClinicRegistrationInput = z.infer<typeof CreateClinicRegistrationInputSchema>;
export type JoinClinicRegistrationInput = z.infer<typeof JoinClinicRegistrationInputSchema>;
export type CreateHospitalRegistrationInput = z.infer<typeof CreateHospitalRegistrationInputSchema>;
export type JoinHospitalRegistrationInput = z.infer<typeof JoinHospitalRegistrationInputSchema>;
export type RegistrationInput = z.infer<typeof RegistrationInputSchema>;
export type RecordingCreate = z.infer<typeof RecordingCreateSchema>;
export type TranscriptionSessionFinalization = z.infer<typeof TranscriptionSessionFinalizationSchema>;
