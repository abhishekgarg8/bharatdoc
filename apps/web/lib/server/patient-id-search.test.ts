import { describe, expect, it } from "vitest";
import { escapePatientIdLikePattern, patientIdSearchPattern } from "@/lib/server/patient-id-search";

describe("patient ID search pattern", () => {
  it("searches by contained partial patient IDs", () => {
    expect(patientIdSearchPattern("250003")).toBe("250003%");
    expect(patientIdSearchPattern("P-QA-250003")).toBe("P-QA-250003%");
  });

  it("escapes Postgres LIKE wildcards in user input", () => {
    expect(escapePatientIdLikePattern("P_10%\\QA")).toBe("P\\_10\\%\\\\QA");
  });
});
