-- Issue #64: durable PHI deletion receipts, complete object manifests, and expiry reconciliation.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $migration$
begin
  if exists (
    select 1 from pg_extension ext
    join pg_namespace ns on ns.oid = ext.extnamespace
    where ext.extname = 'pgcrypto' and ns.nspname <> 'extensions'
  ) then
    execute 'alter extension pgcrypto set schema extensions';
  end if;
end;
$migration$;
create table if not exists public.deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('recording', 'account', 'retention')),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  actor_hash text not null check (actor_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check (state in ('queued', 'running', 'completed', 'failed')),
  attempt integer not null default 0 check (attempt >= 0),
  object_count integer not null default 0 check (object_count >= 0),
  deleted_object_count integer not null default 0 check (deleted_object_count >= 0),
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '1 year',
  unique (request_type, subject_hash, actor_hash)
);

create table if not exists public.deletion_object_queue (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.deletion_receipts(id) on delete cascade,
  bucket text not null check (bucket in ('audio', 'pdfs', 'assets')),
  storage_path text not null check (storage_path <> ''),
  state text not null default 'queued' check (state in ('queued', 'deleting', 'deleted')),
  attempt integer not null default 0 check (attempt >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (receipt_id, bucket, storage_path),
  check ((state = 'deleting') = (lease_token is not null and lease_expires_at is not null))
);

-- Transient identifier needed only until the server finalizer removes the auth identity.
create table if not exists public.account_deletion_queue (
  receipt_id uuid primary key references public.deletion_receipts(id) on delete cascade,
  auth_user_id text not null,
  state text not null default 'blocked' check (state in ('blocked', 'ready', 'deleting')),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state = 'deleting') = (lease_token is not null and lease_expires_at is not null))
);

create index if not exists idx_deletion_objects_claim on public.deletion_object_queue(state, lease_expires_at, created_at);
create index if not exists idx_account_deletion_claim on public.account_deletion_queue(state, lease_expires_at, created_at);
alter table public.deletion_receipts enable row level security;
alter table public.deletion_object_queue enable row level security;
alter table public.account_deletion_queue enable row level security;

create or replace function public.enqueue_recording_deletion_objects(
  p_receipt_id uuid, p_recording_id uuid, p_doctor_id uuid, p_clinic_id uuid
) returns void language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare prefix text := p_clinic_id::text || '/' || p_doctor_id::text || '/' || p_recording_id::text;
begin
  insert into public.deletion_object_queue(receipt_id, bucket, storage_path)
  select distinct p_receipt_id, refs.bucket, refs.storage_path from (
    select 'audio'::text bucket, r.audio_storage_path storage_path from public.recordings r where r.id = p_recording_id
    union all select 'pdfs', r.pdf_storage_path from public.recordings r where r.id = p_recording_id
    union all select 'audio', a.audio_storage_path from public.transcription_attempts a where a.recording_id = p_recording_id
    union all select 'audio', c.storage_path from public.transcription_chunks c where c.recording_key = p_recording_id
    union all select case when a.kind = 'pdf' then 'pdfs' else 'audio' end, a.storage_path
      from public.processing_artifacts a where a.recording_key = p_recording_id and a.state <> 'deleted'
    union all select o.bucket_id, o.name from storage.objects o
      where o.bucket_id in ('audio', 'pdfs')
        and (o.name = prefix or o.name like prefix || '.%' or o.name like prefix || '-%')
  ) refs where refs.storage_path is not null and refs.storage_path <> ''
  on conflict (receipt_id, bucket, storage_path) do nothing;
end;
$$;

create or replace function public.request_recording_deletion(p_recording_id uuid, p_doctor_id uuid)
returns public.deletion_receipts language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare target public.recordings%rowtype; receipt public.deletion_receipts%rowtype;
declare subject_digest text := encode(extensions.digest('recording:' || p_recording_id::text, 'sha256'), 'hex');
declare actor_digest text := encode(extensions.digest('doctor:' || p_doctor_id::text, 'sha256'), 'hex');
begin
  if p_recording_id is null or p_doctor_id is null then raise exception 'DELETION_INPUT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));
  select * into receipt from public.deletion_receipts
    where request_type = 'recording' and subject_hash = subject_digest and actor_hash = actor_digest;
  if receipt.id is not null then return receipt; end if;
  select * into target from public.recordings where id = p_recording_id and doctor_id = p_doctor_id for update;
  if target.id is null then raise exception 'RECORDING_NOT_FOUND'; end if;
  update public.recording_processing_jobs set state = 'failed', error_code = 'PROCESSING_LEASE_EXPIRED',
    failure_count = failure_count + 1, lease_token = null, lease_expires_at = null, updated_at = now()
  where recording_key = target.id and state = 'running' and lease_expires_at <= now();
  if exists(select 1 from public.recording_processing_jobs where recording_key = target.id and state = 'running') then
    raise exception 'RECORDING_PROCESSING_ACTIVE';
  end if;
  insert into public.deletion_receipts(request_type, subject_hash, actor_hash)
    values ('recording', subject_digest, actor_digest) returning * into receipt;
  perform public.enqueue_recording_deletion_objects(receipt.id, target.id, target.doctor_id, target.clinic_id);
  delete from public.diagnostic_logs where recording_id = target.id
    or metadata->>'recording_id' = target.id::text or coalesce(message, '') like '%' || target.id::text || '%'
    or coalesce(url, '') like '%' || target.id::text || '%'
    or (target.patient_id is not null and patient_id = target.patient_id and (doctor_id = target.doctor_id or clinic_id = target.clinic_id));
  delete from public.transcription_attempts where recording_id = target.id;
  delete from public.processing_artifacts where recording_key = target.id;
  delete from public.transcription_chunks where recording_key = target.id;
  delete from public.processing_usage_reservations where job_id in (
    select id from public.recording_processing_jobs where recording_key = target.id
  );
  delete from public.recording_processing_jobs where recording_key = target.id;
  delete from public.recordings where id = target.id;
  update public.deletion_receipts set object_count = (
    select count(*) from public.deletion_object_queue where receipt_id = receipt.id
  ), state = case when exists(select 1 from public.deletion_object_queue where receipt_id = receipt.id)
    then 'queued' else 'completed' end,
    completed_at = case when exists(select 1 from public.deletion_object_queue where receipt_id = receipt.id)
      then null else now() end where id = receipt.id returning * into receipt;
  return receipt;
end;
$$;

create or replace function public.request_account_deletion(p_auth_user_id text, p_doctor_id uuid)
returns public.deletion_receipts language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare target public.doctors%rowtype; item record; receipt public.deletion_receipts%rowtype;
declare subject_digest text := encode(extensions.digest('account:' || p_auth_user_id, 'sha256'), 'hex');
declare actor_digest text := encode(extensions.digest('doctor:' || p_doctor_id::text, 'sha256'), 'hex');
begin
  if nullif(p_auth_user_id, '') is null or p_doctor_id is null then raise exception 'DELETION_INPUT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('account-delete:' || p_doctor_id::text, 0));
  select * into receipt from public.deletion_receipts
    where request_type = 'account' and subject_hash = subject_digest and actor_hash = actor_digest;
  if receipt.id is not null then return receipt; end if;
  select * into target from public.doctors where id = p_doctor_id and firebase_uid = p_auth_user_id for update;
  if target.id is null then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if target.role = 'owner' and exists(select 1 from public.doctors where clinic_id = target.clinic_id and id <> target.id) then
    raise exception 'ACCOUNT_OWNER_TRANSFER_REQUIRED';
  end if;
  for item in select id from public.recordings where doctor_id = target.id order by id loop
    perform pg_advisory_xact_lock(hashtextextended(item.id::text, 0));
  end loop;
  update public.recording_processing_jobs set state = 'failed', error_code = 'PROCESSING_LEASE_EXPIRED',
    failure_count = failure_count + 1, lease_token = null, lease_expires_at = null, updated_at = now()
  where doctor_key = target.id and state = 'running' and lease_expires_at <= now();
  if exists(select 1 from public.recording_processing_jobs where doctor_key = target.id and state = 'running') then
    raise exception 'RECORDING_PROCESSING_ACTIVE';
  end if;
  insert into public.deletion_receipts(request_type, subject_hash, actor_hash)
    values ('account', subject_digest, actor_digest) returning * into receipt;
  for item in select id, doctor_id, clinic_id from public.recordings where doctor_id = target.id for update loop
    perform public.enqueue_recording_deletion_objects(receipt.id, item.id, item.doctor_id, item.clinic_id);
  end loop;
  if target.profile_photo_path is not null then
    insert into public.deletion_object_queue(receipt_id, bucket, storage_path)
      values (receipt.id, 'assets', target.profile_photo_path) on conflict do nothing;
  end if;
  if target.role = 'owner' then
    insert into public.deletion_object_queue(receipt_id, bucket, storage_path)
      select receipt.id, 'assets', logo_storage_path from public.clinics
      where id = target.clinic_id and logo_storage_path is not null on conflict do nothing;
    insert into public.deletion_object_queue(receipt_id, bucket, storage_path)
      select receipt.id, 'assets', o.name from storage.objects o
      where o.bucket_id = 'assets' and o.name like target.clinic_id::text || '/%' on conflict do nothing;
  end if;
  insert into public.deletion_object_queue(receipt_id, bucket, storage_path)
    select receipt.id, o.bucket_id, o.name from storage.objects o
    where o.bucket_id in ('audio', 'pdfs', 'assets') and o.name like target.clinic_id::text || '/' || target.id::text || '/%'
    on conflict do nothing;
  delete from public.diagnostic_logs where doctor_id = target.id
    or recording_id in (select id from public.recordings where doctor_id = target.id)
    or metadata->>'doctor_id' = target.id::text or metadata->>'auth_user_id' = p_auth_user_id
    or metadata->>'recording_id' in (select id::text from public.recordings where doctor_id = target.id);
  delete from public.transcription_attempts where doctor_id = target.id;
  delete from public.processing_artifacts where recording_key in (select id from public.recordings where doctor_id = target.id);
  delete from public.transcription_chunks where recording_key in (select id from public.recordings where doctor_id = target.id);
  delete from public.processing_usage_reservations where doctor_key = target.id;
  delete from public.recording_processing_jobs where doctor_key = target.id;
  delete from public.recordings where doctor_id = target.id;
  update public.clinic_join_requests set reviewed_by = null where reviewed_by = target.id and doctor_id <> target.id;
  delete from public.clinic_join_requests where doctor_id = target.id;
  delete from public.doctors where id = target.id;
  if target.role = 'owner' then delete from public.clinics where id = target.clinic_id; end if;
  update public.deletion_receipts set object_count = (
    select count(*) from public.deletion_object_queue where receipt_id = receipt.id
  ), state = 'queued', completed_at = null where id = receipt.id returning * into receipt;
  insert into public.account_deletion_queue(receipt_id, auth_user_id, state)
    values (receipt.id, p_auth_user_id, case when receipt.state = 'completed' then 'ready' else 'blocked' end);
  return receipt;
end;
$$;

create or replace function public.claim_deletion_objects(p_receipt_id uuid, p_limit integer default 20)
returns table(id uuid, receipt_id uuid, bucket text, storage_path text, lease_token uuid)
language sql security definer set search_path = public, pg_temp as $$
  with candidates as (
    select q.id from public.deletion_object_queue q
    where q.receipt_id = p_receipt_id and (q.state = 'queued' or (q.state = 'deleting' and q.lease_expires_at <= now()))
    order by q.created_at limit least(greatest(p_limit, 1), 100) for update skip locked
  ), claimed as (
    update public.deletion_object_queue q set state = 'deleting', attempt = q.attempt + 1,
      lease_token = gen_random_uuid(), lease_expires_at = now() + interval '5 minutes', last_error_code = null
    from candidates where q.id = candidates.id returning q.*
  ), receipts as (
    update public.deletion_receipts r set state = 'running', attempt = r.attempt + 1
    where r.id in (select distinct c.receipt_id from claimed c) returning r.id
  ) select c.id, c.receipt_id, c.bucket, c.storage_path, c.lease_token from claimed c
$$;

create or replace function public.complete_deletion_object(p_id uuid, p_lease_token uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.deletion_object_queue set state = 'deleted', deleted_at = now(), lease_token = null, lease_expires_at = null
  where id = p_id and state = 'deleting' and lease_token = p_lease_token;
  if not found and not exists(select 1 from public.deletion_object_queue where id = p_id and state = 'deleted') then
    raise exception 'DELETION_LEASE_LOST';
  end if;
end;
$$;

create or replace function public.release_deletion_object(p_id uuid, p_lease_token uuid, p_error_code text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.deletion_object_queue set state = 'queued', lease_token = null, lease_expires_at = null,
    last_error_code = left(coalesce(p_error_code, 'OBJECT_DELETE_FAILED'), 120)
  where id = p_id and state = 'deleting' and lease_token = p_lease_token;
  if not found then raise exception 'DELETION_LEASE_LOST'; end if;
end;
$$;

create or replace function public.finalize_deletion_receipt(p_receipt_id uuid)
returns public.deletion_receipts language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt public.deletion_receipts%rowtype;
begin
  select * into receipt from public.deletion_receipts where id = p_receipt_id for update;
  if receipt.id is null then raise exception 'DELETION_RECEIPT_NOT_FOUND'; end if;
  if exists(select 1 from public.deletion_object_queue where receipt_id = receipt.id and state <> 'deleted') then
    update public.deletion_receipts set state = 'failed', error_code = 'OBJECT_CLEANUP_INCOMPLETE'
      where id = receipt.id returning * into receipt;
    return receipt;
  end if;
  if receipt.request_type = 'account' then
    update public.deletion_receipts set state = 'running', deleted_object_count = object_count,
      completed_at = null, error_code = 'AUTH_DELETE_PENDING' where id = receipt.id returning * into receipt;
    update public.account_deletion_queue set state = 'ready' where receipt_id = receipt.id;
  else
    update public.deletion_receipts set state = 'completed', deleted_object_count = object_count,
      completed_at = coalesce(completed_at, now()), error_code = null where id = receipt.id returning * into receipt;
  end if;
  delete from public.deletion_object_queue where receipt_id = receipt.id; -- discard paths; receipt remains non-PHI.
  return receipt;
end;
$$;

create or replace function public.find_account_deletion(p_auth_user_id text)
returns public.deletion_receipts language sql security definer set search_path = public, pg_temp as $$
  select r.* from public.account_deletion_queue q join public.deletion_receipts r on r.id = q.receipt_id
  where q.auth_user_id = p_auth_user_id order by q.created_at desc limit 1
$$;

create or replace function public.list_deletion_receipts_for_processing(p_limit integer default 10)
returns table(id uuid) language sql security definer set search_path = public, pg_temp as $$
  select r.id from public.deletion_receipts r where r.state in ('queued', 'failed') or (
    r.state = 'running' and r.error_code is distinct from 'AUTH_DELETE_PENDING'
    and not exists(select 1 from public.deletion_object_queue q where q.receipt_id = r.id
      and q.state = 'deleting' and q.lease_expires_at > now())
  )
  order by r.requested_at limit least(greatest(p_limit, 1), 50)
$$;

create or replace function public.get_deletion_receipt_for_doctor(p_receipt_id uuid, p_doctor_id uuid)
returns public.deletion_receipts language sql security definer set search_path = public, extensions, pg_temp as $$
  select r.* from public.deletion_receipts r where r.id = p_receipt_id
    and r.request_type = 'recording'
    and r.actor_hash = encode(extensions.digest('doctor:' || p_doctor_id::text, 'sha256'), 'hex')
$$;

create or replace function public.claim_account_auth_deletion(p_receipt_id uuid default null)
returns table(receipt_id uuid, auth_user_id text, lease_token uuid)
language sql security definer set search_path = public, pg_temp as $$
  with candidate as (
    select q.receipt_id from public.account_deletion_queue q
    where (p_receipt_id is null or q.receipt_id = p_receipt_id)
      and (q.state = 'ready' or (q.state = 'deleting' and q.lease_expires_at <= now()))
    order by q.created_at limit 1 for update skip locked
  )
  update public.account_deletion_queue q set state = 'deleting', lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '5 minutes' from candidate where q.receipt_id = candidate.receipt_id
  returning q.receipt_id, q.auth_user_id, q.lease_token
$$;

create or replace function public.complete_account_auth_deletion(p_receipt_id uuid, p_lease_token uuid)
returns public.deletion_receipts language plpgsql security definer set search_path = public, pg_temp as $$
declare receipt public.deletion_receipts%rowtype;
begin
  delete from public.account_deletion_queue where receipt_id = p_receipt_id and state = 'deleting' and lease_token = p_lease_token;
  if not found then
    select * into receipt from public.deletion_receipts where id = p_receipt_id;
    if receipt.id is not null and receipt.state = 'completed' then return receipt; end if;
    raise exception 'DELETION_LEASE_LOST';
  end if;
  update public.deletion_receipts set state = 'completed', completed_at = now(), error_code = null
    where id = p_receipt_id and request_type = 'account' returning * into receipt;
  return receipt;
end;
$$;

create or replace function public.release_account_auth_deletion(p_receipt_id uuid, p_lease_token uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.account_deletion_queue set state = 'ready', lease_token = null, lease_expires_at = null
  where receipt_id = p_receipt_id and state = 'deleting' and lease_token = p_lease_token;
  if not found then raise exception 'DELETION_LEASE_LOST'; end if;
  update public.deletion_receipts set state = 'failed', error_code = 'AUTH_DELETE_FAILED' where id = p_receipt_id;
end;
$$;

create or replace function public.reconcile_retention_and_orphans()
returns jsonb language plpgsql security definer set search_path = public, storage, pg_temp as $$
declare v_receipt_id uuid; queued integer; logs_deleted integer; attempts_deleted integer;
begin
  update public.recording_processing_jobs set state = 'failed', error_code = 'PROCESSING_LEASE_EXPIRED',
    failure_count = failure_count + 1, lease_token = null, lease_expires_at = null, updated_at = now()
  where state = 'running' and lease_expires_at <= now();
  delete from public.diagnostic_logs where created_at < now() - interval '30 days';
  get diagnostics logs_deleted = row_count;
  delete from public.transcription_attempts where created_at < now() - interval '30 days';
  get diagnostics attempts_deleted = row_count;
  insert into public.deletion_receipts(request_type, subject_hash, actor_hash)
    values ('retention', encode(extensions.digest('retention:' || clock_timestamp()::text, 'sha256'), 'hex'),
      encode(extensions.digest('system-retention', 'sha256'), 'hex')) returning id into v_receipt_id;
  insert into public.deletion_object_queue(receipt_id, bucket, storage_path)
    select v_receipt_id, o.bucket_id, o.name from storage.objects o
    where o.bucket_id in ('audio', 'pdfs') and o.created_at < now() - interval '1 day'
      and not exists(select 1 from public.recordings r where
        (o.bucket_id = 'audio' and r.audio_storage_path = o.name) or (o.bucket_id = 'pdfs' and r.pdf_storage_path = o.name))
      and (o.bucket_id <> 'audio' or not exists(select 1 from public.transcription_attempts t where t.audio_storage_path = o.name))
      and (o.bucket_id <> 'audio' or not exists(select 1 from public.transcription_chunks c where c.storage_path = o.name))
      and not exists(select 1 from public.processing_artifacts a where a.storage_path = o.name and a.state <> 'deleted'
        and ((o.bucket_id = 'audio' and a.kind = 'audio') or (o.bucket_id = 'pdfs' and a.kind = 'pdf')))
      and not exists(select 1 from public.deletion_object_queue q where q.bucket = o.bucket_id and q.storage_path = o.name)
    on conflict do nothing;
  get diagnostics queued = row_count;
  update public.deletion_receipts set object_count = queued, state = case when queued = 0 then 'completed' else 'queued' end,
    completed_at = case when queued = 0 then now() else null end where id = v_receipt_id;
  delete from public.processing_artifacts a where a.state = 'deleted' and a.deleted_at < now() - interval '90 days';
  update public.processing_artifacts set job_id = null where job_id in (
    select id from public.recording_processing_jobs where state <> 'running'
      and coalesce(completed_at, updated_at, created_at) < now() - interval '90 days'
  );
  delete from public.transcription_chunks where job_id in (
    select id from public.recording_processing_jobs where state <> 'running'
      and coalesce(completed_at, updated_at, created_at) < now() - interval '90 days'
  );
  delete from public.processing_usage_reservations where job_id in (
    select id from public.recording_processing_jobs where state <> 'running'
      and coalesce(completed_at, updated_at, created_at) < now() - interval '90 days'
  );
  delete from public.recording_processing_jobs where state <> 'running'
    and coalesce(completed_at, updated_at, created_at) < now() - interval '90 days';
  delete from public.deletion_receipts where expires_at < now() and state = 'completed';
  return jsonb_build_object('receipt_id', v_receipt_id, 'orphan_objects_queued', queued,
    'diagnostic_logs_deleted', logs_deleted, 'transcription_attempts_deleted', attempts_deleted);
end;
$$;

revoke all on table public.deletion_receipts, public.deletion_object_queue, public.account_deletion_queue from public, anon, authenticated;
revoke all on function public.enqueue_recording_deletion_objects(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.request_recording_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.request_account_deletion(text,uuid) from public, anon, authenticated;
revoke all on function public.claim_deletion_objects(uuid,integer) from public, anon, authenticated;
revoke all on function public.complete_deletion_object(uuid,uuid) from public, anon, authenticated;
revoke all on function public.release_deletion_object(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.finalize_deletion_receipt(uuid) from public, anon, authenticated;
revoke all on function public.find_account_deletion(text) from public, anon, authenticated;
revoke all on function public.list_deletion_receipts_for_processing(integer) from public, anon, authenticated;
revoke all on function public.get_deletion_receipt_for_doctor(uuid,uuid) from public, anon, authenticated;
revoke all on function public.claim_account_auth_deletion(uuid) from public, anon, authenticated;
revoke all on function public.complete_account_auth_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.release_account_auth_deletion(uuid,uuid) from public, anon, authenticated;
revoke all on function public.reconcile_retention_and_orphans() from public, anon, authenticated;
grant execute on function public.request_recording_deletion(uuid,uuid) to service_role;
grant execute on function public.request_account_deletion(text,uuid) to service_role;
grant execute on function public.claim_deletion_objects(uuid,integer) to service_role;
grant execute on function public.complete_deletion_object(uuid,uuid) to service_role;
grant execute on function public.release_deletion_object(uuid,uuid,text) to service_role;
grant execute on function public.finalize_deletion_receipt(uuid) to service_role;
grant execute on function public.find_account_deletion(text) to service_role;
grant execute on function public.list_deletion_receipts_for_processing(integer) to service_role;
grant execute on function public.get_deletion_receipt_for_doctor(uuid,uuid) to service_role;
grant execute on function public.claim_account_auth_deletion(uuid) to service_role;
grant execute on function public.complete_account_auth_deletion(uuid,uuid) to service_role;
grant execute on function public.release_account_auth_deletion(uuid,uuid) to service_role;
grant execute on function public.reconcile_retention_and_orphans() to service_role;
