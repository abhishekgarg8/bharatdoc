import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const migration = readFileSync(
  resolve(dirname, "../../../supabase/migrations/202604230001_initial_schema.sql"),
  "utf8"
);

describe("initial Supabase migration contract", () => {
  it("creates all Phase 1 domain tables", () => {
    for (const table of ["clinics", "doctors", "clinic_join_requests", "recordings"]) {
      expect(migration).toContain(`public.${table}`);
    }
  });

  it("creates required access and lookup indexes", () => {
    for (const indexName of [
      "idx_recordings_doctor_date",
      "idx_recordings_clinic_patient",
      "idx_join_requests_clinic_status",
      "idx_clinics_code",
      "idx_one_pending_request"
    ]) {
      expect(migration).toContain(indexName);
    }
  });

  it("creates private storage buckets used by the worker", () => {
    for (const bucketName of ["audio", "pdfs", "assets"]) {
      expect(migration).toContain(`('${bucketName}', '${bucketName}', false)`);
    }
  });

  it("enables RLS so browser anon access is denied by default", () => {
    for (const table of ["clinics", "doctors", "clinic_join_requests", "recordings"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });
});
