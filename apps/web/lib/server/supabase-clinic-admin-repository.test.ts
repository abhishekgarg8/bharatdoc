import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "lib/server/supabase-clinic-admin-repository.ts"), "utf8");

describe("supabase clinic admin repository source contract", () => {
  it("uses the explicit join-request doctor relationship for pending approvals", () => {
    expect(source).toContain(
      '.select("id, requested_at, doctors!clinic_join_requests_doctor_id_fkey(id, name, specialization, phone, created_at)")'
    );
  });
});
