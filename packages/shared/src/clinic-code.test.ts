import { describe, expect, it } from "vitest";
import { generateClinicCode, isClinicCode } from "./clinic-code.js";

describe("clinic code generation", () => {
  it("generates deterministic uppercase six-character codes from supplied random bytes", () => {
    const code = generateClinicCode(() => new Uint8Array([0, 1, 2, 3, 4, 5]));

    expect(code).toBe("ABCDEF");
    expect(isClinicCode(code)).toBe(true);
  });

  it("accepts database-compatible human-assigned clinic codes", () => {
    expect(isClinicCode("MED42X")).toBe(true);
    expect(isClinicCode("PGIMER")).toBe(true);
    expect(isClinicCode("MED4OX")).toBe(true);
    expect(isClinicCode("med42x")).toBe(false);
    expect(isClinicCode("MED42")).toBe(false);
    expect(isClinicCode("MED401")).toBe(false);
  });
});
