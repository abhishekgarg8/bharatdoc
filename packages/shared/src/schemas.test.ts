import { describe, expect, it } from "vitest";
import {
  DoctorSchema,
  RegistrationInputSchema,
  TranscriptionSessionFinalizationSchema,
  TranscriptionSessionFinalizeRequestSchema
} from "./schemas.js";

describe("transcription session finalization schemas", () => {
  it("accepts only an empty request and a PHI-safe canonical result", () => {
    expect(TranscriptionSessionFinalizeRequestSchema.parse({})).toEqual({});
    expect(() => TranscriptionSessionFinalizeRequestSchema.parse({ transcript: "tampered" })).toThrow();
    expect(TranscriptionSessionFinalizationSchema.parse({
      recording_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "transcribed", transcript_hash: "a".repeat(64), generation: 1,
      finalized_at: "2026-07-14T00:00:00.000000+00:00"
    })).not.toHaveProperty("transcript");
  });
});

describe("registration input schemas", () => {
  it("accepts hospital creation and join input", () => {
    expect(
      RegistrationInputSchema.parse({
        mode: "create_hospital",
        profile: {
          name: "Dr. Kavita Rao",
          specialization: "Pediatrician"
        },
        hospital: {
          name: "Sunrise Hospital",
          address: "24 Baner Road, Pune"
        }
      })
    ).toMatchObject({
      mode: "create_hospital",
      hospital: { name: "Sunrise Hospital" }
    });

    expect(
      RegistrationInputSchema.parse({
        mode: "join_hospital",
        profile: {
          name: "Dr. Aparna Iyer",
          specialization: "General Physician"
        },
        hospital_id: "22222222-2222-4222-8222-222222222222"
      })
    ).toMatchObject({
      mode: "join_hospital",
      hospital_id: "22222222-2222-4222-8222-222222222222"
    });
  });

  it("accepts owner clinic creation input", () => {
    expect(
      RegistrationInputSchema.parse({
        mode: "create_clinic",
        profile: {
          name: "Dr. Kavita Rao",
          specialization: "Pediatrician"
        },
        clinic: {
          name: "Sunrise Clinic",
          address: "24 Baner Road, Pune"
        }
      })
    ).toMatchObject({
      mode: "create_clinic",
      profile: { name: "Dr. Kavita Rao" },
      clinic: { name: "Sunrise Clinic" }
    });
  });

  it("accepts doctor clinic join input", () => {
    expect(
      RegistrationInputSchema.parse({
        mode: "join_clinic",
        profile: {
          name: "Dr. Aparna Iyer",
          specialization: "General Physician"
        },
        clinic_code: "MED42X"
      })
    ).toMatchObject({
      mode: "join_clinic",
      clinic_code: "MED42X"
    });
  });

  it("normalizes clinic code input before registration", () => {
    expect(
      RegistrationInputSchema.parse({
        mode: "join_clinic",
        profile: {
          name: "Dr. PGIMER Pilot",
          specialization: "Internal Medicine"
        },
        clinic_code: " pgimer "
      })
    ).toMatchObject({
      mode: "join_clinic",
      clinic_code: "PGIMER"
    });
  });

  it("does not expose legacy medical registration values in parsed registration input", () => {
    const parsed = RegistrationInputSchema.parse({
      mode: "join_clinic",
      profile: {
        name: "Dr. Aparna Iyer",
        specialization: "General Physician",
        medical_reg_no: "MCI-MH-45231"
      },
      clinic_code: "MED42X"
    });

    expect(parsed.profile).toEqual({
      name: "Dr. Aparna Iyer",
      specialization: "General Physician"
    });
  });

  it("does not expose legacy medical registration values in parsed doctor rows", () => {
    const parsed = DoctorSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      firebase_uid: "firebase-doctor",
      clinic_id: "22222222-2222-4222-8222-222222222222",
      role: "doctor",
      account_status: "active",
      name: "Dr. Aparna Iyer",
      specialization: "General Physician",
      medical_reg_no: "MCI-MH-45231",
      phone: "+919876543210",
      profile_photo_path: null,
      custom_prompt: null,
      transcription_lang: "auto",
      created_at: "2026-04-23T09:00:00.000Z"
    });

    expect(parsed).not.toHaveProperty("medical_reg_no");
  });

  it("rejects incomplete profile input", () => {
    expect(() =>
      RegistrationInputSchema.parse({
        mode: "join_clinic",
        profile: {
          name: "",
          specialization: "General Physician"
        },
        clinic_code: "MED42X"
      })
    ).toThrow();
  });
});
