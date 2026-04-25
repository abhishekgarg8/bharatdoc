import { describe, expect, it } from "vitest";
import { AccessError, assertActiveDoctor, assertCanRemoveDoctor, assertClinicScope, assertOwner } from "./access.js";
import type { Doctor } from "./schemas.js";

const activeOwner: Doctor = {
  id: "11111111-1111-4111-8111-111111111111",
  firebase_uid: "owner-firebase",
  clinic_id: "22222222-2222-4222-8222-222222222222",
  role: "owner",
  account_status: "active",
  name: "Dr. Owner",
  specialization: "General Physician",
  phone: "+919876543210",
  profile_photo_path: null,
  custom_prompt: null,
  transcription_lang: "auto",
  created_at: "2026-04-23T09:00:00.000Z"
};

describe("access control helpers", () => {
  it("allows active doctors", () => {
    expect(assertActiveDoctor(activeOwner)).toBe(activeOwner);
  });

  it("blocks pending or rejected doctors", () => {
    const pending = { ...activeOwner, account_status: "pending_approval" as const };

    expect(() => assertActiveDoctor(pending)).toThrow(AccessError);
  });

  it("requires owner role for admin actions", () => {
    const doctor = { ...activeOwner, role: "doctor" as const };

    expect(assertOwner(activeOwner)).toBe(activeOwner);
    expect(() => assertOwner(doctor)).toThrow("Hospital owner access is required.");
  });

  it("enforces clinic scope on shared patient records", () => {
    expect(assertClinicScope(activeOwner, activeOwner.clinic_id!)).toBe(activeOwner);
    expect(() => assertClinicScope(activeOwner, "33333333-3333-4333-8333-333333333333")).toThrow(
      "outside the doctor's hospital"
    );
  });

  it("prevents clinic owners from removing themselves", () => {
    expect(() => assertCanRemoveDoctor(activeOwner, activeOwner.id)).toThrow("cannot remove themself");
    expect(() => assertCanRemoveDoctor(activeOwner, "44444444-4444-4444-8444-444444444444")).not.toThrow();
  });
});
