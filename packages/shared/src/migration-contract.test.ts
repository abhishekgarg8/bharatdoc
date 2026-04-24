import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const migration = readFileSync(
  resolve(dirname, "../../../supabase/migrations/202604230001_initial_schema.sql"),
  "utf8"
);
const reviewRpcMigration = readFileSync(
  resolve(dirname, "../../../supabase/migrations/202604240001_review_clinic_join_request_rpc.sql"),
  "utf8"
);
const hardenedReviewRpcMigration = readFileSync(
  resolve(dirname, "../../../supabase/migrations/202604240002_harden_join_request_review_rpc.sql"),
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

  it("adds an atomic join-request review RPC", () => {
    expect(reviewRpcMigration).toContain("public.review_clinic_join_request");
    expect(reviewRpcMigration).toContain("and status = 'pending'");
    expect(reviewRpcMigration).toContain("get diagnostics changed_rows = row_count");
  });

  it("hardens join-request review RPC execution privileges", () => {
    expect(hardenedReviewRpcMigration).toContain("role = 'owner'");
    expect(hardenedReviewRpcMigration).toContain("account_status = 'active'");
    expect(hardenedReviewRpcMigration).toContain("and clinic_id = owner_clinic_id");
    expect(hardenedReviewRpcMigration).toContain(
      "revoke all on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) from public"
    );
    expect(hardenedReviewRpcMigration).toContain(
      "revoke execute on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) from anon"
    );
    expect(hardenedReviewRpcMigration).toContain(
      "revoke execute on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) from authenticated"
    );
    expect(hardenedReviewRpcMigration).toContain(
      "grant execute on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) to service_role"
    );
  });
});
