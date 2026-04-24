import { describe, expect, it, vi } from "vitest";
import type { Doctor } from "@bharatdoc/shared";
import {
  getDoctorPreferencesForUser,
  updateDoctorPreferencesForUser,
  type DoctorPreferencesRepository
} from "@/lib/server/settings";

const activeDoctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-doctor",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: "Summarize {{transcript}}",
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

function createRepository(doctor: Doctor | null = activeDoctor): DoctorPreferencesRepository {
  return {
    findDoctorByAuthUid: vi.fn(async () => doctor),
    updateDoctorPreferences: vi.fn(async (_doctorId, input) => ({
      ...activeDoctor,
      ...input
    }))
  };
}

describe("doctor settings preferences", () => {
  it("returns preferences for active doctors", async () => {
    const repository = createRepository();

    await expect(
      getDoctorPreferencesForUser({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, repository)
    ).resolves.toEqual({
      custom_prompt: "Summarize {{transcript}}",
      transcription_lang: "auto"
    });
  });

  it("updates transcription language", async () => {
    const repository = createRepository();

    await expect(
      updateDoctorPreferencesForUser(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        { transcription_lang: "hien" },
        repository
      )
    ).resolves.toMatchObject({ transcription_lang: "hien" });
    expect(repository.updateDoctorPreferences).toHaveBeenCalledWith(activeDoctor.id, {
      transcription_lang: "hien"
    });
  });

  it("trims and stores valid custom prompts", async () => {
    const repository = createRepository();

    await expect(
      updateDoctorPreferencesForUser(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        { custom_prompt: "  Summarize {{transcript}}  " },
        repository
      )
    ).resolves.toMatchObject({ custom_prompt: "Summarize {{transcript}}" });
    expect(repository.updateDoctorPreferences).toHaveBeenCalledWith(activeDoctor.id, {
      custom_prompt: "Summarize {{transcript}}"
    });
  });

  it("allows clearing the custom prompt back to default", async () => {
    const repository = createRepository();

    await expect(
      updateDoctorPreferencesForUser(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        { custom_prompt: null },
        repository
      )
    ).resolves.toMatchObject({ custom_prompt: null });
  });

  it("rejects prompts without the transcript placeholder", async () => {
    const repository = createRepository();

    await expect(
      updateDoctorPreferencesForUser(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        { custom_prompt: "Summarize this consultation" },
        repository
      )
    ).rejects.toMatchObject({ code: "MISSING_TRANSCRIPT_PLACEHOLDER" });
    expect(repository.updateDoctorPreferences).not.toHaveBeenCalled();
  });

  it("blocks inactive doctors", async () => {
    const repository = createRepository({ ...activeDoctor, account_status: "rejected" });

    await expect(
      updateDoctorPreferencesForUser(
        { uid: "firebase-doctor", phoneNumber: "+919876543210" },
        { transcription_lang: "en" },
        repository
      )
    ).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
  });

  it("requires at least one preference field", async () => {
    const repository = createRepository();

    await expect(
      updateDoctorPreferencesForUser({ uid: "firebase-doctor", phoneNumber: "+919876543210" }, {}, repository)
    ).rejects.toMatchObject({ code: "EMPTY_PREFERENCES_UPDATE" });
  });
});
