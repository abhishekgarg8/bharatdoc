import type { Doctor, TranscriptionLanguage } from "@bharatdoc/shared";
import { parseJsonOrThrow } from "@/lib/client/api-error";

export interface DoctorPreferences {
  custom_prompt: string | null;
  transcription_lang: TranscriptionLanguage;
}

export interface DoctorPreferencesResponse {
  doctor?: Doctor;
  preferences: DoctorPreferences | null;
}

export interface DoctorPreferencesBootstrap {
  doctor: Doctor;
  preferences: DoctorPreferences | null;
}

export interface DoctorPreferencesUpdate {
  custom_prompt?: string | null;
  transcription_lang?: TranscriptionLanguage;
}

function authHeaders(idToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${idToken}`
  };
}

export async function fetchDoctorPreferences(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<DoctorPreferences> {
  const response = await fetcher("/api/settings/preferences", {
    headers: authHeaders(idToken)
  });
  const payload = await parseJsonOrThrow<{ preferences: DoctorPreferences }>(response, "Unable to load settings preferences.");

  return payload.preferences;
}

export async function fetchDoctorPreferencesBootstrap(
  idToken: string,
  fetcher: typeof fetch = fetch
): Promise<DoctorPreferencesBootstrap> {
  const response = await fetcher("/api/settings/preferences", {
    headers: authHeaders(idToken)
  });

  return parseJsonOrThrow<DoctorPreferencesBootstrap>(response, "Unable to load settings preferences.");
}

export async function updateDoctorPreferences(
  idToken: string,
  input: DoctorPreferencesUpdate,
  fetcher: typeof fetch = fetch
): Promise<DoctorPreferences> {
  const response = await fetcher("/api/settings/preferences", {
    method: "PATCH",
    headers: {
      ...authHeaders(idToken),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  const payload = await parseJsonOrThrow<{ preferences: DoctorPreferences }>(response, "Unable to save settings preferences.");

  return payload.preferences;
}
