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
const aiProcessingMigration = readFileSync(
  resolve(dirname, "../../../supabase/migrations/202607100001_ai_processing_controls.sql"),
  "utf8",
);
const manifestHotfixPath = resolve(
  dirname,
  "../../../supabase/migrations/202607100002_fix_transcription_manifest_ambiguity.sql",
);
const retentionMigrationPath = resolve(
  dirname,
  "../../../supabase/migrations/202607110001_phi_retention_and_deletion.sql",
);
const manifestStatusPath = resolve(
  dirname,
  "../../../supabase/migrations/202607140001_transcription_manifest_status.sql",
);
const durableSessionsPath = resolve(
  dirname,
  "../../../supabase/migrations/202607140001_transcription_manifest_status.sql",
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

  it("adds durable AI jobs, immutable chunks, atomic quotas, and PHI-free cost metrics", () => {
    for (const table of [
      "recording_processing_jobs", "processing_usage_reservations",
      "transcription_chunks", "processing_artifacts"
    ]) expect(aiProcessingMigration).toContain(`public.${table}`);
    expect(aiProcessingMigration).toContain("processing_job_idempotency_unique");
    expect(aiProcessingMigration).toContain("processing_job_logical_input_unique");
    expect(aiProcessingMigration).toContain("transcription_chunk_recording_index_unique");
    expect(aiProcessingMigration).toContain("pg_advisory_xact_lock(6201");
    expect(aiProcessingMigration).toContain("pg_advisory_xact_lock(6202");
    expect(aiProcessingMigration).toContain("QUOTA_DOCTOR_TRANSCRIPTION_MINUTES");
    expect(aiProcessingMigration).toContain("QUOTA_DOCTOR_TRANSCRIPTION'");
    expect(aiProcessingMigration).toContain("doctor_daily_operations >= 24");
    expect(aiProcessingMigration).toContain("QUOTA_CLINIC_STORAGE");
    expect(aiProcessingMigration).toContain("save_recording_summary_with_processing_lock");
    expect(aiProcessingMigration).toContain("provider_calls");
    expect(aiProcessingMigration).toContain("cleanup_claimed_at < now() - interval '5 minutes'");
    expect(aiProcessingMigration).toContain("for update skip locked");
    expect(aiProcessingMigration).toContain("processing_job_lease_state_check");
    expect(aiProcessingMigration).toContain("QUOTA_PROCESSING_RETRIES");
    expect(aiProcessingMigration).toContain("reserved_job.state = 'running'");
    expect(aiProcessingMigration).toContain("active_job.state = 'running'");
    expect(aiProcessingMigration).toContain("PROCESSING_ARTIFACT_CLEANUP_BUSY");
    expect(aiProcessingMigration).toContain("TRANSCRIPTION_MANIFEST_INCOMPLETE");
    expect(aiProcessingMigration).toContain("PROCESSING_OUTPUT_REPLACED");
    expect(aiProcessingMigration).toContain("mark_processing_artifact_ready(uuid,uuid,text)");
    expect(aiProcessingMigration).not.toContain("patient_id");
  });

  it("replaces the transcription manifest RPC without ambiguous JSON aliases", () => {
    const hotfix = readFileSync(manifestHotfixPath, "utf8");
    expect(hotfix).toContain("create or replace function public.save_transcription_chunk_manifest");
    expect(hotfix).toContain("manifest_element jsonb");
    expect(hotfix).toContain("as manifest_entries(entry)");
    expect(hotfix).not.toContain("jsonb_array_elements(p_chunks) item");
    expect(hotfix).toMatch(
      /grant execute on function public\.save_transcription_chunk_manifest\(uuid,uuid,uuid,jsonb\)\s+to service_role/,
    );
  });

  it("adds chunk-level transcription manifest status and failure metadata", () => {
    const status = readFileSync(manifestStatusPath, "utf8");
    expect(status).toContain("add column if not exists error_code text");
    expect(status).toContain("add column if not exists error_message text");
    expect(status).toContain("create or replace function public.fail_transcription_chunk");
    expect(status).toContain("state = 'failed'");
    expect(status).toContain("TRANSCRIPTION_CHUNK_STATE_INVALID");
    expect(status).toMatch(
      /grant execute on function public\.fail_transcription_chunk\(uuid,uuid,integer,text,text\)\s+to service_role/,
    );
  });

  it("adds owner-scoped durable transcription sessions and service-role-only chunk transitions", () => {
    const migration = readFileSync(durableSessionsPath, "utf8");
    expect(migration).toContain("create table public.transcription_sessions");
    expect(migration).toContain("unique (doctor_id, idempotency_key)");
    expect(migration).toContain("transcription_chunk_session_index_unique");
    expect(migration).toContain("TRANSCRIPTION_SESSION_ACTIVE");
    expect(migration).toContain("create or replace function public.claim_transcription_session_chunk");
    expect(migration).toContain("insert into public.processing_artifacts(session_id");
    expect(migration).toContain("state='provider_submitted'");
    expect(migration).toContain("'auto','en','hi','hien'");
    expect(migration).toContain("s.mime_type<>p_mime_type");
    expect(migration).toContain("set mime_type=coalesce(target_session.mime_type,p_mime_type)");
    expect(migration).toContain("recording_id uuid not null references public.recordings(id) on delete cascade");
    expect(migration).toContain("create or replace function public.expire_transcription_sessions");
    expect(migration).toContain("sessions_expired:=public.expire_transcription_sessions(v_receipt_id)");
    expect(migration).toMatch(/insert into public\.deletion_object_queue[\s\S]+delete from public\.processing_artifacts[\s\S]+delete from public\.transcription_chunks[\s\S]+delete from public\.transcription_sessions/);
    expect(migration).toContain("recording.duration_seconds+1");
    expect(migration).toContain("state in ('stored','provider_submitted','completed')");
    expect(migration).toContain("alter table public.transcription_sessions enable row level security");
    expect(migration).toContain("from public,anon,authenticated");
    expect(migration).toContain("to service_role");
  });

  it("adds durable, PHI-minimal record/account deletion and scheduled retention contracts", () => {
    const retention = readFileSync(retentionMigrationPath, "utf8");
    for (const table of ["deletion_receipts", "deletion_object_queue"]) {
      expect(retention).toContain(`public.${table}`);
      expect(retention).toContain(`alter table public.${table} enable row level security`);
    }
    for (const rpc of [
      "request_recording_deletion", "request_account_deletion", "claim_deletion_objects",
      "complete_deletion_object", "release_deletion_object", "finalize_deletion_receipt",
      "reconcile_retention_and_orphans"
    ]) expect(retention).toContain(`public.${rpc}`);
    expect(retention).toContain("storage.objects");
    expect(retention).toContain("public.transcription_attempts t where t.audio_storage_path = o.name");
    expect(retention).toContain("digest(");
    expect(retention).toContain("for update skip locked");
    expect(retention).toContain("select distinct c.receipt_id from claimed c");
    expect(retention).toContain("r.error_code is distinct from 'AUTH_DELETE_PENDING'");
    expect(retention).toContain("q.lease_expires_at > now()");
    expect(retention).toContain("interval '5 minutes'");
    expect(retention).toContain("interval '30 days'");
    expect(retention).toContain("interval '90 days'");
    expect(retention.match(/PROCESSING_LEASE_EXPIRED/g)?.length).toBeGreaterThanOrEqual(3);
    expect(retention.match(/state = 'running' and lease_expires_at <= now\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(retention).toContain("r.error_code is distinct from 'AUTH_DELETE_PENDING'");
    expect(retention).toContain("q.state = 'deleting' and q.lease_expires_at > now()");
    expect(retention).toContain("grant execute on function public.request_recording_deletion(uuid,uuid) to service_role");
    expect(retention).not.toContain("grant execute on function public.request_recording_deletion(uuid,uuid) to authenticated");
  });

  it("excludes sensitive mobile data from Android cloud/transfer and iOS backups", () => {
    const root = resolve(dirname, "../../..");
    const manifest = readFileSync(resolve(root, "apps/mobile/android/app/src/main/AndroidManifest.xml"), "utf8");
    const extraction = readFileSync(resolve(root, "apps/mobile/android/app/src/main/res/xml/data_extraction_rules.xml"), "utf8");
    const ios = readFileSync(resolve(root, "apps/mobile/ios/App/App/AppDelegate.swift"), "utf8");
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    const legacy = readFileSync(resolve(root, "apps/mobile/android/app/src/main/res/xml/backup_rules.xml"), "utf8");
    for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
      expect(legacy).toContain(`domain="${domain}"`);
      expect(extraction.match(new RegExp(`domain="${domain}"`, "g"))?.length).toBe(2);
    }
    for (const domain of ["device_root", "device_file", "device_database", "device_sharedpref"]) {
      expect(extraction.match(new RegExp(`domain="${domain}"`, "g"))?.length).toBe(2);
    }
    expect(extraction).toContain("<cloud-backup");
    expect(extraction).toContain("<device-transfer>");
    expect(ios).toContain("values.isExcludedFromBackup = true");
    expect(ios).toContain("applicationSupportDirectory");
    expect(ios).toContain(".libraryDirectory");
    expect(ios.match(/excludeSensitiveWebDataFromBackup\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
