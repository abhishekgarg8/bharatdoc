import type { TranscriptionLanguage } from "@bharatdoc/shared";

export interface DoctorPreferences {
  custom_prompt: string | null;
  transcription_lang: TranscriptionLanguage;
}

export interface DoctorPreferencesResponse {
  preferences: DoctorPreferences;
}

export interface DoctorPreferencesUpdate {
  custom_prompt?: string | null;
  transcription_lang?: TranscriptionLanguage;
}

async function parseJson<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
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
  const payload = await parseJson<DoctorPreferencesResponse>(response, "Unable to load settings preferences.");

  return payload.preferences;
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
  const payload = await parseJson<DoctorPreferencesResponse>(response, "Unable to save settings preferences.");

  return payload.preferences;
}
