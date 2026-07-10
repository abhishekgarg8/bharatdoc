import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "lib/server/supabase-diagnostic-log-repository.ts"), "utf8");

describe("supabase diagnostic log repository", () => {
  it("keeps filters inside clinic scope and selects only response-safe columns", () => {
    const clinicScope = source.indexOf('.eq("clinic_id", clinicId)');

    expect(clinicScope).toBeGreaterThan(0);
    for (const filter of ["recording_id", "patient_id", "device_id"]) {
      expect(source.indexOf(`.eq("${filter}", filters.`)).toBeGreaterThan(clinicScope);
    }
    const selection = source.slice(source.indexOf(".select("), clinicScope);
    expect(selection).not.toMatch(/message|patient_id|user_agent|url|metadata|session_id|device_id|request_id/);
  });
});
