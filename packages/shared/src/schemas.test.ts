import { describe, expect, it } from "vitest";
import { RegistrationInputSchema } from "./schemas.js";

describe("registration input schemas", () => {
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
