import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "lib/server/supabase-recordings-repository.ts"), "utf8");

describe("supabase recordings repository source contract", () => {
  it("keeps patient search clinic-scoped while allowing partial patient IDs", () => {
    expect(source).toContain('.eq("clinic_id", clinicId)');
    expect(source).toContain('.ilike("patient_id", patientIdSearchPattern(patientId))');
    expect(source).not.toContain('.eq("patient_id", patientId)');
  });
});
