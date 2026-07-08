import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const migration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202604230001_initial_schema.sql",
  ),
  "utf8",
);
const reviewRpcMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202604240001_review_clinic_join_request_rpc.sql",
  ),
  "utf8",
);
const hardenedReviewRpcMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202604240002_harden_join_request_review_rpc.sql",
  ),
  "utf8",
);
const transcriptionAttemptsMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202604250003_create_transcription_attempts.sql",
  ),
  "utf8",
);
const atomicOnboardingRpcMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202604250004_atomic_onboarding_rpcs.sql",
  ),
  "utf8",
);
const diagnosticLoggingMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202605170001_diagnostic_logging.sql",
  ),
  "utf8",
);
const pgimerAutoApprovalMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202607060002_auto_approve_pgimer_join_requests.sql",
  ),
  "utf8",
);
const pdfMetadataMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202607080002_add_pdf_metadata.sql",
  ),
  "utf8",
);
const phiRlsPoliciesMigration = readFileSync(
  resolve(
    dirname,
    "../../../supabase/migrations/202607080003_add_phi_rls_policies.sql",
  ),
  "utf8",
);

describe("initial Supabase migration contract", () => {
  it("creates all Phase 1 domain tables", () => {
    for (const table of [
      "clinics",
      "doctors",
      "clinic_join_requests",
      "recordings",
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
  });

  it("creates required access and lookup indexes", () => {
    for (const indexName of [
      "idx_recordings_doctor_date",
      "idx_recordings_clinic_patient",
      "idx_join_requests_clinic_status",
      "idx_clinics_code",
      "idx_one_pending_request",
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
    for (const table of [
      "clinics",
      "doctors",
      "clinic_join_requests",
      "recordings",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`,
      );
    }
  });

  it("adds a private transcription failure audit table", () => {
    expect(transcriptionAttemptsMigration).toContain(
      "create table if not exists public.transcription_attempts",
    );
    expect(transcriptionAttemptsMigration).toContain(
      "recording_id uuid not null references public.recordings(id)",
    );
    expect(transcriptionAttemptsMigration).toContain(
      "request_id text not null",
    );
    expect(transcriptionAttemptsMigration).toContain("stage text not null");
    expect(transcriptionAttemptsMigration).toContain(
      "error_code text not null",
    );
    expect(transcriptionAttemptsMigration).toContain(
      "error_message text not null",
    );
    expect(transcriptionAttemptsMigration).toContain(
      "idx_transcription_attempts_recording_date",
    );
    expect(transcriptionAttemptsMigration).toContain(
      "alter table public.transcription_attempts enable row level security",
    );
  });

  it("adds an atomic join-request review RPC", () => {
    expect(reviewRpcMigration).toContain("public.review_clinic_join_request");
    expect(reviewRpcMigration).toContain("and status = 'pending'");
    expect(reviewRpcMigration).toContain(
      "get diagnostics changed_rows = row_count",
    );
  });

  it("hardens join-request review RPC execution privileges", () => {
    expect(hardenedReviewRpcMigration).toContain("role = 'owner'");
    expect(hardenedReviewRpcMigration).toContain("account_status = 'active'");
    expect(hardenedReviewRpcMigration).toContain(
      "and clinic_id = owner_clinic_id",
    );
    expect(hardenedReviewRpcMigration).toContain(
      "revoke all on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) from public",
    );
    expect(hardenedReviewRpcMigration).toContain(
      "revoke execute on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) from anon",
    );
    expect(hardenedReviewRpcMigration).toContain(
      "revoke execute on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) from authenticated",
    );
    expect(hardenedReviewRpcMigration).toContain(
      "grant execute on function public.review_clinic_join_request(uuid, uuid, uuid, text, text) to service_role",
    );
  });

  it("adds atomic onboarding RPCs for owner and join-request creation", () => {
    expect(atomicOnboardingRpcMigration).toContain(
      "public.create_owner_account",
    );
    expect(atomicOnboardingRpcMigration).toContain(
      "public.create_doctor_join_request",
    );
    expect(atomicOnboardingRpcMigration).toContain(
      "pg_advisory_xact_lock",
    );
    expect(atomicOnboardingRpcMigration).toContain(
      "'existing_doctor'",
    );
    expect(atomicOnboardingRpcMigration).toContain(
      "grant execute on function public.create_owner_account(text, text, text, text, text, text, text, text, text) to service_role",
    );
    expect(atomicOnboardingRpcMigration).toContain(
      "grant execute on function public.create_doctor_join_request(text, text, text, text, text, uuid) to service_role",
    );
  });

  it("adds PGIMER auto-approval to the atomic join-request RPC", () => {
    expect(pgimerAutoApprovalMigration).toContain(
      "drop function if exists public.create_doctor_join_request(text, text, text, text, text, uuid)",
    );
    expect(pgimerAutoApprovalMigration).toContain("p_auto_approve boolean default false");
    expect(pgimerAutoApprovalMigration).toContain("auto_approve_join := p_auto_approve and target_clinic.clinic_code = 'PGIMER'");
    expect(pgimerAutoApprovalMigration).toContain("case when auto_approve_join then 'active' else 'pending_approval' end");
    expect(pgimerAutoApprovalMigration).toContain("case when auto_approve_join then 'approved' else 'pending' end");
    expect(pgimerAutoApprovalMigration).toContain("case when auto_approve_join then now() else null end");
    expect(pgimerAutoApprovalMigration).toContain(
      "grant execute on function public.create_doctor_join_request(text, text, text, text, text, uuid, boolean) to service_role",
    );
  });

  it("adds user-facing PDF metadata columns without exposing storage paths", () => {
    expect(pdfMetadataMigration).toContain("add column if not exists pdf_generated_at timestamptz");
    expect(pdfMetadataMigration).toContain("add column if not exists pdf_version text");
    expect(pdfMetadataMigration).toContain("where pdf_storage_path is not null");
  });

  it("adds RLS helper functions for authenticated doctor and clinic scope", () => {
    for (const helper of [
      "public.current_authenticated_doctor_id",
      "public.current_authenticated_doctor_clinic_id",
      "public.current_active_doctor_id",
      "public.current_active_doctor_clinic_id",
      "public.current_active_owner_clinic_id",
    ]) {
      expect(phiRlsPoliciesMigration).toContain(`create or replace function ${helper}()`);
      expect(phiRlsPoliciesMigration).toContain(`grant execute on function ${helper}() to authenticated`);
    }

    expect(phiRlsPoliciesMigration).toContain("where firebase_uid = auth.uid()::text");
    expect(phiRlsPoliciesMigration).toContain("security definer");
    expect(phiRlsPoliciesMigration).toContain("set search_path = public, pg_temp");
  });

  it("adds clinic-scoped and owner-only PHI RLS policies", () => {
    for (const policy of [
      "clinics_select_active_members",
      "clinics_update_active_owners",
      "doctors_select_own_or_clinic_members",
      "clinic_join_requests_select_own_or_owner",
      "clinic_join_requests_insert_own_pending",
      "clinic_join_requests_update_active_owners",
      "recordings_select_active_clinic_members",
      "recordings_insert_own_active_clinic",
      "recordings_update_own_records",
      "recordings_delete_own_records",
    ]) {
      expect(phiRlsPoliciesMigration).toContain(`create policy ${policy}`);
    }

    expect(phiRlsPoliciesMigration).toContain("clinic_id = public.current_active_doctor_clinic_id()");
    expect(phiRlsPoliciesMigration).toContain("clinic_id = public.current_authenticated_doctor_clinic_id()");
    expect(phiRlsPoliciesMigration).toContain("clinic_id = public.current_active_owner_clinic_id()");
    expect(phiRlsPoliciesMigration).toContain("doctor_id = public.current_active_doctor_id()");
    expect(phiRlsPoliciesMigration).toContain("status = 'pending'");
    expect(phiRlsPoliciesMigration).toContain("No direct authenticated UPDATE policy is granted on public.doctors");
    expect(phiRlsPoliciesMigration).not.toContain("create policy doctors_update");
  });

  it("documents that trusted service-role workflows intentionally bypass RLS", () => {
    expect(phiRlsPoliciesMigration).toContain("service_role clients");
    expect(phiRlsPoliciesMigration).toContain("service_role bypasses RLS");
  });

  it("adds private diagnostic logs and richer transcription attempt metadata", () => {
    expect(diagnosticLoggingMigration).toContain(
      "create table if not exists public.diagnostic_logs",
    );
    expect(diagnosticLoggingMigration).toContain(
      "constraint diagnostic_logs_source_check check (source in ('device', 'web', 'worker'))",
    );
    expect(diagnosticLoggingMigration).toContain(
      "idx_diagnostic_logs_recording_date",
    );
    expect(diagnosticLoggingMigration).toContain(
      "alter table public.diagnostic_logs enable row level security",
    );
    expect(diagnosticLoggingMigration).toContain(
      "add column if not exists upstream_message text",
    );
    expect(diagnosticLoggingMigration).toContain(
      "add column if not exists audio_size_bytes integer",
    );
    expect(diagnosticLoggingMigration).toContain("'download_audio'");
  });
});
