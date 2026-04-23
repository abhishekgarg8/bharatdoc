export const DOCTOR_ROLES = ["owner", "doctor"] as const;
export const ACCOUNT_STATUSES = ["pending_approval", "active", "rejected"] as const;
export const JOIN_REQUEST_STATUSES = ["pending", "approved", "rejected"] as const;
export const RECORDING_STATUSES = ["recorded", "transcribed", "summary_ready", "pdf_saved"] as const;
export const TRANSCRIPTION_LANGUAGES = ["auto", "hi", "en", "hien"] as const;

export type DoctorRole = (typeof DOCTOR_ROLES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type JoinRequestStatus = (typeof JOIN_REQUEST_STATUSES)[number];
export type RecordingStatus = (typeof RECORDING_STATUSES)[number];
export type TranscriptionLanguage = (typeof TRANSCRIPTION_LANGUAGES)[number];

export const MAX_RECORDING_SECONDS = 60 * 60;
export const MAX_AUDIO_BYTES_PHASE_1 = 25 * 1024 * 1024;
export const CLINIC_CODE_LENGTH = 6;
