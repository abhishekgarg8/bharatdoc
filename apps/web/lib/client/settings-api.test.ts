import { describe, expect, it, vi } from "vitest";
import { fetchDoctorPreferences, updateDoctorPreferences, updateDoctorProfile } from "@/lib/client/settings-api";

describe("settings preferences API client", () => {
  it("loads doctor preferences with a bearer token", async () => {
    const preferences = {
      custom_prompt: null,
      transcription_lang: "auto" as const
    };
    const fetcher = vi.fn(async () => Response.json({ preferences })) as unknown as typeof fetch;

    await expect(fetchDoctorPreferences("id-token", fetcher)).resolves.toEqual(preferences);
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      headers: {
        Authorization: "Bearer id-token"
      }
    });
  });

  it("updates doctor preferences through PATCH", async () => {
    const preferences = {
      custom_prompt: "Summarize {{transcript}}",
      transcription_lang: "hien" as const
    };
    const fetcher = vi.fn(async () => Response.json({ preferences })) as unknown as typeof fetch;

    await expect(
      updateDoctorPreferences("id-token", { custom_prompt: "Summarize {{transcript}}", transcription_lang: "hien" }, fetcher)
    ).resolves.toEqual(preferences);
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ custom_prompt: "Summarize {{transcript}}", transcription_lang: "hien" })
    });
  });

  it("updates the doctor profile through PATCH", async () => {
    const doctor = {
      id: "11111111-1111-4111-8111-111111111111",
      firebase_uid: "firebase-doctor",
      clinic_id: "22222222-2222-4222-8222-222222222222",
      role: "doctor" as const,
      account_status: "active" as const,
      name: "Dr. Nisha Shah",
      specialization: "Pediatrics",
      phone: "doctor@example.com",
      profile_photo_path: null,
      custom_prompt: null,
      transcription_lang: "auto" as const,
      created_at: "2026-04-23T09:00:00.000Z"
    };
    const fetcher = vi.fn(async () => Response.json({ doctor })) as unknown as typeof fetch;

    await expect(updateDoctorProfile("id-token", { name: "Dr. Nisha Shah", specialization: "Pediatrics" }, fetcher)).resolves.toEqual(doctor);
    expect(fetcher).toHaveBeenCalledWith("/api/settings/preferences", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer id-token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: "Dr. Nisha Shah", specialization: "Pediatrics" })
    });
  });
});
