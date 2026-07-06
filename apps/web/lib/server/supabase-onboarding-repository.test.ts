import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "lib/server/supabase-onboarding-repository.ts"), "utf8");

describe("supabase onboarding repository source contract", () => {
  it("creates owner accounts through the atomic onboarding RPC", () => {
    expect(source).toContain('supabase.rpc("create_owner_account"');
    expect(source).not.toContain('.from("clinics")\n        .insert');
    expect(source).not.toContain('.from("doctors")\n        .insert');
  });

  it("creates doctor join requests through the atomic onboarding RPC", () => {
    expect(source).toContain('supabase.rpc("create_doctor_join_request"');
    expect(source).toContain("p_auto_approve: input.autoApprove");
    expect(source).not.toContain('.from("clinic_join_requests")\n        .insert');
  });

  it("converts duplicate RPC payloads into existing-account flow errors", () => {
    expect(source).toContain("ExistingDoctorAccountError");
    expect(source).toContain("existing_doctor");
  });
});
