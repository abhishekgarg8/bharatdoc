import { describe, expect, it } from "vitest";
import type { Clinic, Doctor, Recording } from "@bharatdoc/shared";
import { createSimplePdfRenderer } from "../pdf-renderer.js";

const clinic: Clinic = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Sunrise Clinic",
  clinic_code: "MED42X",
  address: "Pune",
  logo_storage_path: null,
  created_at: "2026-04-23T05:00:00.000Z"
};

const doctor: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "firebase-active",
  clinic_id: clinic.id,
  role: "doctor",
  account_status: "active",
  name: "Dr. Aparna Iyer",
  specialization: "General Physician",
  medical_reg_no: null,
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

const recording: Recording = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  doctor_id: doctor.id,
  clinic_id: clinic.id,
  patient_id: "P-10483",
  label: "Follow-up",
  duration_seconds: 24,
  audio_storage_path: "clinic/doctor/recording.webm",
  transcript: "Patient reports fever.",
  summary: "Chief Complaint: Fever\nPlan: Fluids and paracetamol.",
  pdf_storage_path: null,
  status: "summary_ready",
  recorded_at: "2026-04-23T06:20:00.000Z",
  created_at: "2026-04-23T06:20:01.000Z"
};

describe("simple PDF renderer", () => {
  it("renders a valid PDF buffer with clinical context", async () => {
    const pdf = await createSimplePdfRenderer().render({
      clinic,
      doctor,
      recording,
      generatedAt: new Date("2026-04-23T09:00:00.000Z")
    });
    const text = pdf.toString("ascii");

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("Sunrise Clinic");
    expect(text).toContain("Patient P-10483");
    expect(text).toContain("Chief Complaint: Fever");
    expect(text).toContain("%%EOF");
  });
});
