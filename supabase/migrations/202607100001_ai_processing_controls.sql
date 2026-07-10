-- Durable, service-role-only admission and recovery for cost-bearing AI work.
create table if not exists public.recording_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid references public.recordings(id) on delete set null,
  recording_key uuid not null,
  doctor_id uuid references public.doctors(id) on delete set null,
  doctor_key uuid not null,
  clinic_id uuid references public.clinics(id) on delete set null,
  clinic_key uuid not null,
  operation text not null check (operation in ('transcription', 'summary', 'pdf')),
  state text not null default 'running' check (state in ('running', 'completed', 'failed')),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 120),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  attempt integer not null default 1 check (attempt > 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_request_key text,
  provider_submitted_at timestamptz,
  result jsonb,
  error_code text,
  transcription_seconds numeric(12,3) not null default 0 check (transcription_seconds >= 0),
  storage_bytes bigint not null default 0 check (storage_bytes >= 0),
  provider text,
  provider_calls integer not null default 0 check (provider_calls >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  provider_latency_ms bigint not null default 0 check (provider_latency_ms >= 0),
  estimated_cost_usd numeric(14,6) not null default 0 check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint processing_job_lease_state_check check (
    (state = 'running' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'running' and lease_token is null and lease_expires_at is null)
  ),
  constraint processing_job_idempotency_unique unique (doctor_key, operation, idempotency_key),
  constraint processing_job_logical_input_unique unique (recording_key, operation, input_hash)
);

create index if not exists idx_processing_jobs_active_doctor
  on public.recording_processing_jobs(doctor_key, lease_expires_at)
  where state = 'running';
create index if not exists idx_processing_jobs_active_clinic
  on public.recording_processing_jobs(clinic_key, lease_expires_at)
  where state = 'running';
create unique index if not exists idx_processing_jobs_one_active_recording
  on public.recording_processing_jobs(recording_key)
  where state = 'running';

create table if not exists public.processing_usage_reservations (
  job_id uuid primary key references public.recording_processing_jobs(id) on delete restrict,
  doctor_key uuid not null,
  clinic_key uuid not null,
  operation text not null check (operation in ('transcription', 'summary', 'pdf')),
  transcription_seconds numeric(12,3) not null default 0,
  storage_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_processing_usage_doctor_date
  on public.processing_usage_reservations(doctor_key, created_at desc);
create index if not exists idx_processing_usage_clinic_date
  on public.processing_usage_reservations(clinic_key, created_at desc);

create table if not exists public.transcription_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.recording_processing_jobs(id) on delete restrict,
  recording_key uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  expected_count integer not null check (expected_count between 1 and 8),
  byte_size integer not null check (byte_size > 0),
  duration_seconds numeric(12,3) not null check (duration_seconds >= 0),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  storage_path text not null,
  state text not null default 'pending' check (state in ('pending', 'provider_submitted', 'completed', 'failed')),
  provider_request_key text,
  transcript text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transcription_chunk_job_index_unique unique (job_id, chunk_index),
  constraint transcription_chunk_recording_index_unique unique (recording_key, chunk_index)
);

create table if not exists public.processing_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.recording_processing_jobs(id) on delete restrict,
  origin text not null default 'worker' check (origin in ('worker', 'manual', 'legacy')),
  recording_key uuid not null,
  kind text not null check (kind in ('audio', 'pdf')),
  storage_path text not null unique,
  byte_size bigint not null default 0 check (byte_size >= 0),
  checksum text check (checksum is null or checksum ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending', 'current', 'superseded', 'orphaned', 'deleting', 'deleted')),
  cleanup_token uuid,
  cleanup_claimed_at timestamptz,
  cleanup_previous_state text check (cleanup_previous_state is null or cleanup_previous_state in ('superseded', 'orphaned')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_processing_artifacts_cleanup
  on public.processing_artifacts(state, created_at)
  where state in ('superseded', 'orphaned', 'deleting');

alter table public.recording_processing_jobs enable row level security;
alter table public.processing_usage_reservations enable row level security;
alter table public.transcription_chunks enable row level security;
alter table public.processing_artifacts enable row level security;

create or replace function public.claim_recording_processing_job(
  p_operation text,
  p_idempotency_key text,
  p_input_hash text,
  p_recording_id uuid,
  p_doctor_id uuid,
  p_clinic_id uuid,
  p_transcription_seconds numeric default 0,
  p_storage_bytes bigint default 0
)
returns table (
  disposition text,
  id uuid,
  operation text,
  state text,
  lease_token uuid,
  attempt integer,
  result jsonb,
  input_hash text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.recording_processing_jobs%rowtype;
  new_lease uuid := gen_random_uuid();
  doctor_daily_seconds numeric;
  clinic_daily_seconds numeric;
  doctor_daily_operations bigint;
  clinic_daily_operations bigint;
  doctor_storage bigint;
  clinic_storage bigint;
  doctor_concurrency bigint;
  clinic_concurrency bigint;
  target_recording public.recordings%rowtype;
begin
  if p_operation is null or p_operation not in ('transcription', 'summary', 'pdf')
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 120
     or p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$'
     or p_recording_id is null or p_doctor_id is null or p_clinic_id is null
     or p_transcription_seconds is null or p_storage_bytes is null
     or p_transcription_seconds < 0 or p_storage_bytes < 0 then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;

  -- Serialize every operation for one recording, including different operation types.
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));

  select * into target_recording from public.recordings r where r.id = p_recording_id;
  if target_recording.id is null or target_recording.doctor_id <> p_doctor_id
     or target_recording.clinic_id <> p_clinic_id then
    raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode = 'P0001';
  end if;
  if (p_operation = 'transcription' and target_recording.status <> 'recorded')
     or (p_operation = 'summary' and nullif(btrim(target_recording.transcript), '') is null)
     or (p_operation = 'pdf' and nullif(btrim(target_recording.summary), '') is null) then
    raise exception 'PROCESSING_RECORDING_STATE_INVALID' using errcode = 'P0001';
  end if;
  update public.recording_processing_jobs expired_job set state = 'failed', error_code = 'PROCESSING_LEASE_EXPIRED',
    failure_count = expired_job.failure_count + 1,
    lease_token = null, lease_expires_at = null, updated_at = now()
  where expired_job.recording_key = p_recording_id and expired_job.state = 'running'
    and expired_job.lease_expires_at <= now();
  if target_recording.duration_seconds is null or target_recording.duration_seconds < 0 or target_recording.duration_seconds > 3600
     or (p_operation = 'transcription' and abs(target_recording.duration_seconds - p_transcription_seconds) > 0.01) then
    raise exception 'PROCESSING_DURATION_INVALID' using errcode = 'P0001';
  end if;

  select * into existing
  from public.recording_processing_jobs j
  where j.doctor_key = p_doctor_id
    and j.operation = p_operation
    and j.idempotency_key = p_idempotency_key;

  if existing.id is not null and (existing.input_hash <> p_input_hash or existing.recording_key <> p_recording_id) then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
  end if;

  if existing.id is null then
    select * into existing
    from public.recording_processing_jobs j
    where j.recording_key = p_recording_id
      and j.operation = p_operation
      and j.input_hash = p_input_hash;
  end if;

  if existing.id is null and p_operation = 'transcription' and exists (
    select 1 from public.recording_processing_jobs j
    where j.recording_key = p_recording_id and j.operation = 'transcription' and j.input_hash <> p_input_hash
  ) then
    raise exception 'TRANSCRIPTION_MANIFEST_IMMUTABLE' using errcode = 'P0001';
  end if;

  if existing.id is not null then
    if existing.state = 'completed' then
      return query select 'completed', existing.id, existing.operation, existing.state,
        null::uuid, existing.attempt, existing.result, existing.input_hash, existing.created_at;
      return;
    end if;
    if existing.state = 'running' and existing.lease_expires_at > now() then
      return query select 'running', existing.id, existing.operation, existing.state,
        null::uuid, existing.attempt, existing.result, existing.input_hash, existing.created_at;
      return;
    end if;

    if exists (
      select 1 from public.recording_processing_jobs j
      where j.recording_key = p_recording_id and j.state = 'running' and j.id <> existing.id
    ) then
      raise exception 'PROCESSING_RECORDING_BUSY' using errcode = 'P0001';
    end if;
    if existing.attempt >= 3 then
      raise exception 'QUOTA_PROCESSING_RETRIES' using errcode = 'P0001';
    end if;

    perform pg_advisory_xact_lock(6201, hashtext(p_clinic_id::text));
    perform pg_advisory_xact_lock(6202, hashtext(p_doctor_id::text));
    select count(*) into doctor_concurrency from public.recording_processing_jobs j
      where j.doctor_key = p_doctor_id and j.state = 'running' and j.lease_expires_at > now();
    select count(*) into clinic_concurrency from public.recording_processing_jobs j
      where j.clinic_key = p_clinic_id and j.state = 'running' and j.lease_expires_at > now();
    if doctor_concurrency >= 2 then raise exception 'QUOTA_DOCTOR_CONCURRENCY' using errcode = 'P0001'; end if;
    if clinic_concurrency >= 10 then raise exception 'QUOTA_CLINIC_CONCURRENCY' using errcode = 'P0001'; end if;

    update public.recording_processing_jobs j set
      state = 'running', lease_token = new_lease, lease_expires_at = now() + interval '5 minutes',
      attempt = j.attempt + 1, error_code = null, updated_at = now()
    where j.id = existing.id;
    return query select 'acquired', existing.id, existing.operation, 'running',
      new_lease, existing.attempt + 1, existing.result, existing.input_hash, existing.created_at;
    return;
  end if;

  if exists (
    select 1 from public.recording_processing_jobs j
    where j.recording_key = p_recording_id and j.state = 'running'
  ) then
    raise exception 'PROCESSING_RECORDING_BUSY' using errcode = 'P0001';
  end if;

  -- Quota buckets are locked in the same clinic-then-doctor order for every recording.
  perform pg_advisory_xact_lock(6201, hashtext(p_clinic_id::text));
  perform pg_advisory_xact_lock(6202, hashtext(p_doctor_id::text));
  select count(*) into doctor_concurrency from public.recording_processing_jobs j
    where j.doctor_key = p_doctor_id and j.state = 'running' and j.lease_expires_at > now();
  select count(*) into clinic_concurrency from public.recording_processing_jobs j
    where j.clinic_key = p_clinic_id and j.state = 'running' and j.lease_expires_at > now();
  if doctor_concurrency >= 2 then raise exception 'QUOTA_DOCTOR_CONCURRENCY' using errcode = 'P0001'; end if;
  if clinic_concurrency >= 10 then raise exception 'QUOTA_CLINIC_CONCURRENCY' using errcode = 'P0001'; end if;

  select count(*) into doctor_daily_operations from public.processing_usage_reservations u
    where u.doctor_key = p_doctor_id and u.operation = p_operation and u.created_at >= now() - interval '1 day';
  select count(*) into clinic_daily_operations from public.processing_usage_reservations u
    where u.clinic_key = p_clinic_id and u.operation = p_operation and u.created_at >= now() - interval '1 day';

  if p_operation = 'transcription' then
    -- Browser metadata supplies the expected duration, so a separate operation
    -- ceiling bounds spend even if a compromised client understates it.
    if doctor_daily_operations >= 24 then raise exception 'QUOTA_DOCTOR_TRANSCRIPTION' using errcode = 'P0001'; end if;
    if clinic_daily_operations >= 240 then raise exception 'QUOTA_CLINIC_TRANSCRIPTION' using errcode = 'P0001'; end if;
    select coalesce(sum(u.transcription_seconds), 0) into doctor_daily_seconds
      from public.processing_usage_reservations u where u.doctor_key = p_doctor_id and u.created_at >= now() - interval '1 day';
    select coalesce(sum(u.transcription_seconds), 0) into clinic_daily_seconds
      from public.processing_usage_reservations u where u.clinic_key = p_clinic_id and u.created_at >= now() - interval '1 day';
    if doctor_daily_seconds + p_transcription_seconds > 14400 then raise exception 'QUOTA_DOCTOR_TRANSCRIPTION_MINUTES' using errcode = 'P0001'; end if;
    if clinic_daily_seconds + p_transcription_seconds > 144000 then raise exception 'QUOTA_CLINIC_TRANSCRIPTION_MINUTES' using errcode = 'P0001'; end if;
  else
    if doctor_daily_operations >= 200 then raise exception '%', 'QUOTA_DOCTOR_' || upper(p_operation) using errcode = 'P0001'; end if;
    if clinic_daily_operations >= 2000 then raise exception '%', 'QUOTA_CLINIC_' || upper(p_operation) using errcode = 'P0001'; end if;
  end if;

  -- Count live objects plus reservations that do not yet have an object intent.
  -- Superseded/deleted objects no longer consume quota, while an in-flight job
  -- cannot evade admission before its deterministic artifact is registered.
  select coalesce(sum(a.byte_size), 0) + coalesce((
    select sum(u.storage_bytes) from public.processing_usage_reservations u
    join public.recording_processing_jobs reserved_job on reserved_job.id = u.job_id
    where u.doctor_key = p_doctor_id and reserved_job.state = 'running'
      and not exists (select 1 from public.processing_artifacts pending where pending.job_id = u.job_id)
  ), 0) into doctor_storage
  from public.processing_artifacts a
  join public.recording_processing_jobs artifact_job on artifact_job.id = a.job_id
  where artifact_job.doctor_key = p_doctor_id and a.state in ('pending', 'current');
  select coalesce(sum(a.byte_size), 0) + coalesce((
    select sum(u.storage_bytes) from public.processing_usage_reservations u
    join public.recording_processing_jobs reserved_job on reserved_job.id = u.job_id
    where u.clinic_key = p_clinic_id and reserved_job.state = 'running'
      and not exists (select 1 from public.processing_artifacts pending where pending.job_id = u.job_id)
  ), 0) into clinic_storage
  from public.processing_artifacts a
  join public.recording_processing_jobs artifact_job on artifact_job.id = a.job_id
  where artifact_job.clinic_key = p_clinic_id and a.state in ('pending', 'current');
  if doctor_storage + p_storage_bytes > 2147483648 then raise exception 'QUOTA_DOCTOR_STORAGE' using errcode = 'P0001'; end if;
  if clinic_storage + p_storage_bytes > 21474836480 then raise exception 'QUOTA_CLINIC_STORAGE' using errcode = 'P0001'; end if;

  insert into public.recording_processing_jobs (
    recording_id, recording_key, doctor_id, doctor_key, clinic_id, clinic_key,
    operation, idempotency_key, input_hash, lease_token, lease_expires_at,
    transcription_seconds, storage_bytes
  ) values (
    p_recording_id, p_recording_id, p_doctor_id, p_doctor_id, p_clinic_id, p_clinic_id,
    p_operation, p_idempotency_key, p_input_hash, new_lease, now() + interval '5 minutes',
    p_transcription_seconds, p_storage_bytes
  ) returning * into existing;

  insert into public.processing_usage_reservations (
    job_id, doctor_key, clinic_key, operation, transcription_seconds, storage_bytes
  ) values (existing.id, p_doctor_id, p_clinic_id, p_operation, p_transcription_seconds, p_storage_bytes);

  return query select 'acquired', existing.id, existing.operation, existing.state,
    new_lease, existing.attempt, existing.result, existing.input_hash, existing.created_at;
end;
$$;

create or replace function public.save_transcription_chunk_manifest(
  p_job_id uuid,
  p_lease_token uuid,
  p_recording_id uuid,
  p_chunks jsonb
)
returns setof public.transcription_chunks
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  job public.recording_processing_jobs%rowtype;
  item jsonb;
  item_count integer;
  existing_count integer;
  matched_count integer;
  index_value integer := 0;
  total_bytes bigint := 0;
  total_seconds numeric := 0;
begin
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' then
    raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
  end if;
  item_count := jsonb_array_length(p_chunks);
  select * into job from public.recording_processing_jobs j where j.id = p_job_id for update;
  if job.id is null or job.operation <> 'transcription' or job.recording_key <> p_recording_id
     or job.state <> 'running' or job.lease_token <> p_lease_token or job.lease_expires_at <= now() then
    raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001';
  end if;
  if item_count not between 1 and 8 then raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001'; end if;

  for item in select value from jsonb_array_elements(p_chunks) loop
    if (item->>'index')::integer <> index_value or (item->>'count')::integer <> item_count
       or (item->>'bytes')::integer <= 0 or (item->>'durationSeconds')::numeric < 0
       or (item->>'checksum') !~ '^[a-f0-9]{64}$' or nullif(item->>'storagePath', '') is null then
      raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
    end if;
    total_bytes := total_bytes + (item->>'bytes')::integer;
    total_seconds := total_seconds + (item->>'durationSeconds')::numeric;
    index_value := index_value + 1;
  end loop;
  if total_bytes <> job.storage_bytes or abs(total_seconds - job.transcription_seconds) > 0.01 then
    raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
  end if;

  select count(*) into existing_count from public.transcription_chunks c where c.job_id = p_job_id;
  if existing_count > 0 then
    select count(*) into matched_count
    from public.transcription_chunks c
    join lateral jsonb_array_elements(p_chunks) item on (item->>'index')::integer = c.chunk_index
    where c.job_id = p_job_id
      and c.expected_count = (item->>'count')::integer
      and c.byte_size = (item->>'bytes')::integer
      and abs(c.duration_seconds - (item->>'durationSeconds')::numeric) <= 0.001
      and c.checksum = item->>'checksum'
      and c.storage_path = item->>'storagePath';
    if existing_count <> item_count or matched_count <> item_count then
      raise exception 'TRANSCRIPTION_MANIFEST_IMMUTABLE' using errcode = 'P0001';
    end if;
  else
    insert into public.transcription_chunks (
      job_id, recording_key, chunk_index, expected_count, byte_size,
      duration_seconds, checksum, storage_path
    ) select p_job_id, p_recording_id, (item->>'index')::integer,
      (item->>'count')::integer, (item->>'bytes')::integer,
      (item->>'durationSeconds')::numeric, item->>'checksum', item->>'storagePath'
    from jsonb_array_elements(p_chunks) item;
  end if;
  return query select * from public.transcription_chunks c where c.job_id = p_job_id order by c.chunk_index;
end;
$$;

create or replace function public.mark_processing_provider_submitted(
  p_job_id uuid, p_lease_token uuid, p_provider_request_key text, p_chunk_index integer default null
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.recording_processing_jobs set provider_request_key = p_provider_request_key,
    provider_submitted_at = now(), provider_calls = provider_calls + 1,
    provider = case when operation = 'pdf' then 'react-pdf' else 'openai' end,
    estimated_cost_usd = estimated_cost_usd + case
      when operation = 'summary' then 0.0002
      when operation = 'transcription' and p_chunk_index is not null then coalesce((
        select (chunk.duration_seconds / 60.0) * 0.003
        from public.transcription_chunks chunk
        where chunk.job_id = p_job_id and chunk.chunk_index = p_chunk_index
      ), 0)
      else 0
    end,
    updated_at = now(), lease_expires_at = now() + interval '5 minutes'
  where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  if p_chunk_index is not null then
    update public.transcription_chunks set state = 'provider_submitted', provider_request_key = p_provider_request_key, updated_at = now()
    where job_id = p_job_id and chunk_index = p_chunk_index and state in ('pending', 'failed', 'provider_submitted');
    if not found then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode = 'P0001'; end if;
  end if;
end;
$$;

create or replace function public.heartbeat_recording_processing_job(p_job_id uuid, p_lease_token uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.recording_processing_jobs set lease_expires_at = now() + interval '5 minutes', updated_at = now()
  where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.complete_transcription_chunk(
  p_job_id uuid, p_lease_token uuid, p_chunk_index integer, p_transcript text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.recording_processing_jobs j where j.id = p_job_id and j.state = 'running'
    and j.lease_token = p_lease_token and j.lease_expires_at > now()) then
    raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001';
  end if;
  update public.transcription_chunks set state = 'completed', transcript = p_transcript, updated_at = now()
  where job_id = p_job_id and chunk_index = p_chunk_index and state in ('provider_submitted', 'completed');
  if not found then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.record_processing_provider_call(
  p_job_id uuid, p_lease_token uuid, p_provider text, p_latency_ms bigint, p_estimated_cost_usd numeric
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.recording_processing_jobs set provider = p_provider,
    provider_latency_ms = provider_latency_ms + greatest(p_latency_ms, 0), updated_at = now()
  where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.complete_recording_processing_job(
  p_job_id uuid, p_lease_token uuid, p_result jsonb
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.recording_processing_jobs j where j.id = p_job_id and j.state = 'completed') then
    return;
  end if;
  update public.recording_processing_jobs set state = 'completed', result = p_result,
    lease_token = null, lease_expires_at = null, error_code = null, completed_at = now(), updated_at = now()
  where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.fail_recording_processing_job(
  p_job_id uuid, p_lease_token uuid, p_error_code text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.recording_processing_jobs set state = 'failed', error_code = left(p_error_code, 120),
    failure_count = failure_count + 1, lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_job_id and state = 'running' and lease_token = p_lease_token;
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.record_processing_artifact(
  p_job_id uuid, p_lease_token uuid, p_kind text, p_storage_path text,
  p_byte_size bigint, p_checksum text, p_state text default 'pending'
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  recording_value uuid;
  existing_artifact public.processing_artifacts%rowtype;
begin
  select recording_key into recording_value from public.recording_processing_jobs
    where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if recording_value is null then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  if p_job_id is null or p_lease_token is null or p_kind not in ('audio', 'pdf')
     or nullif(p_storage_path, '') is null or p_byte_size is null or p_byte_size < 0
     or p_checksum is null or p_checksum !~ '^[a-f0-9]{64}$'
     or p_state is null or p_state not in ('pending', 'current') then
    raise exception 'PROCESSING_ARTIFACT_INVALID' using errcode = 'P0001';
  end if;
  select * into existing_artifact from public.processing_artifacts
    where storage_path = p_storage_path for update;
  if existing_artifact.id is not null then
    if existing_artifact.job_id is distinct from p_job_id
       or existing_artifact.recording_key <> recording_value
       or existing_artifact.kind <> p_kind
       or existing_artifact.checksum is distinct from p_checksum
       or existing_artifact.byte_size <> p_byte_size then
      raise exception 'PROCESSING_ARTIFACT_CONFLICT' using errcode = 'P0001';
    end if;
    if existing_artifact.state = 'deleting' then
      raise exception 'PROCESSING_ARTIFACT_CLEANUP_BUSY' using errcode = 'P0001';
    end if;
    update public.processing_artifacts set
      state = case when existing_artifact.state in ('deleted', 'superseded', 'orphaned') then p_state else existing_artifact.state end,
      deleted_at = null, cleanup_token = null, cleanup_claimed_at = null, cleanup_previous_state = null
    where id = existing_artifact.id;
  else
    insert into public.processing_artifacts(job_id, recording_key, kind, storage_path, byte_size, checksum, state)
      values (p_job_id, recording_value, p_kind, p_storage_path, p_byte_size, p_checksum, p_state);
  end if;
end;
$$;

create or replace function public.mark_processing_artifact_ready(
  p_job_id uuid, p_lease_token uuid, p_storage_path text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_artifacts artifact set state = 'current'
  from public.recording_processing_jobs job
  where artifact.storage_path = p_storage_path and artifact.job_id = p_job_id
    and artifact.state in ('pending', 'current', 'superseded', 'orphaned')
    and job.id = p_job_id and job.state = 'running' and job.lease_token = p_lease_token
    and job.lease_expires_at > now();
  if not found then raise exception 'PROCESSING_ARTIFACT_INVALID' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.invalidate_completed_processing_job(
  p_job_id uuid, p_input_hash text, p_error_code text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.recording_processing_jobs j where j.id = p_job_id and j.input_hash = p_input_hash) then
    raise exception 'PROCESSING_JOB_STATE_INVALID' using errcode = 'P0001';
  end if;
  update public.recording_processing_jobs set state = 'failed', error_code = left(p_error_code, 120), updated_at = now()
  where id = p_job_id and state = 'completed' and input_hash = p_input_hash;
end;
$$;

create or replace function public.supersede_processing_artifacts(
  p_recording_id uuid, p_kind text, p_keep_storage_path text
)
returns table(storage_path text)
language sql security definer set search_path = public, pg_temp as $$
  update public.processing_artifacts set state = 'superseded'
  where recording_key = p_recording_id and kind = p_kind and state = 'current'
    and storage_path <> p_keep_storage_path
  returning storage_path
$$;

create or replace function public.mark_processing_artifact_orphaned(p_storage_path text)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.processing_artifacts set state = 'orphaned'
  where storage_path = p_storage_path and state in ('pending', 'current')
$$;

create or replace function public.claim_processing_artifact_cleanup(p_limit integer, p_kinds text[])
returns table(kind text, storage_path text, cleanup_token uuid)
language sql security definer set search_path = public, pg_temp as $$
  with candidates as (
    select id from public.processing_artifacts
    where (
      state in ('superseded', 'orphaned')
      or (state = 'deleting' and cleanup_claimed_at < now() - interval '5 minutes')
    ) and kind = any(p_kinds)
      and (job_id is null or not exists (
        select 1 from public.recording_processing_jobs active_job
        where active_job.id = processing_artifacts.job_id and active_job.state = 'running'
      ))
    order by created_at asc
    limit least(greatest(p_limit, 1), 20)
    for update skip locked
  )
  update public.processing_artifacts artifact set
    cleanup_previous_state = case when artifact.state = 'deleting' then artifact.cleanup_previous_state else artifact.state end,
    state = 'deleting',
    cleanup_token = gen_random_uuid(),
    cleanup_claimed_at = now()
  from candidates where artifact.id = candidates.id
  returning artifact.kind, artifact.storage_path, artifact.cleanup_token
$$;

create or replace function public.complete_processing_artifact_cleanup(p_storage_path text, p_cleanup_token uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_artifacts set state = 'deleted', deleted_at = now(),
    cleanup_token = null, cleanup_claimed_at = null, cleanup_previous_state = null
  where storage_path = p_storage_path and state = 'deleting' and cleanup_token = p_cleanup_token;
  if not found then raise exception 'PROCESSING_ARTIFACT_CLEANUP_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.release_processing_artifact_cleanup(p_storage_path text, p_cleanup_token uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.processing_artifacts set state = cleanup_previous_state,
    cleanup_token = null, cleanup_claimed_at = null, cleanup_previous_state = null
  where storage_path = p_storage_path and state = 'deleting' and cleanup_token = p_cleanup_token;
  if not found then raise exception 'PROCESSING_ARTIFACT_CLEANUP_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.save_recording_summary_with_processing_lock(
  p_recording_id uuid, p_doctor_id uuid, p_expected_transcript text, p_summary text
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target public.recordings%rowtype;
  updated public.recordings%rowtype;
  superseded_path text;
begin
  if p_recording_id is null or p_doctor_id is null or nullif(btrim(p_expected_transcript), '') is null
     or nullif(btrim(p_summary), '') is null then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));
  if exists (
    select 1 from public.recording_processing_jobs j
    where j.recording_key = p_recording_id and j.state = 'running' and j.lease_expires_at > now()
  ) then
    raise exception 'PROCESSING_RECORDING_BUSY' using errcode = 'P0001';
  end if;
  select * into target from public.recordings r
    where r.id = p_recording_id and r.doctor_id = p_doctor_id for update;
  if target.id is null then raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode = 'P0001'; end if;
  if target.transcript is distinct from p_expected_transcript then
    raise exception 'PROCESSING_INPUT_CHANGED' using errcode = 'P0001';
  end if;
  superseded_path := target.pdf_storage_path;
  if superseded_path is not null then
    insert into public.processing_artifacts(job_id, recording_key, kind, storage_path, state, origin)
      values (null, p_recording_id, 'pdf', superseded_path, 'superseded', 'manual')
      on conflict (storage_path) do update set state = case
        when public.processing_artifacts.state in ('deleting', 'deleted') then public.processing_artifacts.state
        else 'superseded' end;
  end if;
  update public.recording_processing_jobs set state = 'failed', error_code = 'PROCESSING_INPUT_CHANGED', updated_at = now()
    where recording_key = p_recording_id and operation = 'pdf' and state = 'completed';
  update public.recording_processing_jobs set state = 'failed', error_code = 'PROCESSING_OUTPUT_REPLACED', updated_at = now()
    where recording_key = p_recording_id and operation = 'summary' and state = 'completed';
  update public.recordings set summary = btrim(p_summary), status = 'summary_ready',
    pdf_storage_path = null, pdf_generated_at = null, pdf_version = null
  where id = p_recording_id and doctor_id = p_doctor_id returning * into updated;
  return jsonb_build_object('recording', to_jsonb(updated), 'superseded_pdf_path', superseded_path);
end;
$$;

create or replace function public.save_generated_summary_with_processing_lock(
  p_job_id uuid, p_lease_token uuid, p_recording_id uuid, p_doctor_id uuid,
  p_expected_transcript text, p_summary text
)
returns public.recordings language plpgsql security definer set search_path = public, pg_temp as $$
declare target public.recordings%rowtype;
begin
  if nullif(btrim(p_expected_transcript), '') is null or nullif(btrim(p_summary), '') is null then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));
  if not exists (
    select 1 from public.recording_processing_jobs j where j.id = p_job_id
      and j.operation = 'summary' and j.recording_key = p_recording_id
      and j.state = 'running' and j.lease_token = p_lease_token and j.lease_expires_at > now()
  ) then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  select * into target from public.recordings r
    where r.id = p_recording_id and r.doctor_id = p_doctor_id for update;
  if target.id is null then raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode = 'P0001'; end if;
  if target.transcript is distinct from p_expected_transcript then
    raise exception 'PROCESSING_INPUT_CHANGED' using errcode = 'P0001';
  end if;
  if target.pdf_storage_path is not null then
    insert into public.processing_artifacts(job_id, recording_key, kind, storage_path, state, origin)
      values (p_job_id, p_recording_id, 'pdf', target.pdf_storage_path, 'superseded', 'legacy')
      on conflict (storage_path) do update set state = case
        when public.processing_artifacts.state in ('deleting', 'deleted') then public.processing_artifacts.state
        else 'superseded' end;
  end if;
  update public.recording_processing_jobs set state = 'failed', error_code = 'PROCESSING_INPUT_CHANGED', updated_at = now()
    where recording_key = p_recording_id and operation = 'pdf' and state = 'completed';
  update public.recordings set summary = p_summary, status = 'summary_ready',
    pdf_storage_path = null, pdf_generated_at = null, pdf_version = null
    where id = p_recording_id returning * into target;
  update public.recording_processing_jobs set state = 'completed',
    result = jsonb_build_object(
      'recording_id', p_recording_id, 'status', 'summary_ready',
      'input_hash', (select source.input_hash from public.recording_processing_jobs source where source.id = p_job_id)
    ),
    lease_token = null, lease_expires_at = null, completed_at = now(), updated_at = now()
    where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  return target;
end;
$$;

create or replace function public.save_generated_pdf_with_processing_lock(
  p_job_id uuid, p_lease_token uuid, p_recording_id uuid, p_doctor_id uuid,
  p_expected_summary text, p_pdf_storage_path text, p_pdf_generated_at timestamptz, p_pdf_version text
)
returns public.recordings language plpgsql security definer set search_path = public, pg_temp as $$
declare target public.recordings%rowtype;
begin
  if nullif(btrim(p_expected_summary), '') is null or nullif(p_pdf_storage_path, '') is null
     or p_pdf_generated_at is null or nullif(p_pdf_version, '') is null then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));
  if not exists (
    select 1 from public.recording_processing_jobs j where j.id = p_job_id
      and j.operation = 'pdf' and j.recording_key = p_recording_id
      and j.state = 'running' and j.lease_token = p_lease_token and j.lease_expires_at > now()
  ) then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  select * into target from public.recordings r
    where r.id = p_recording_id and r.doctor_id = p_doctor_id for update;
  if target.id is null then raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode = 'P0001'; end if;
  if target.summary is distinct from p_expected_summary then
    raise exception 'PROCESSING_INPUT_CHANGED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.processing_artifacts artifact
    where artifact.job_id = p_job_id and artifact.kind = 'pdf'
      and artifact.storage_path = p_pdf_storage_path and artifact.state = 'current'
  ) then raise exception 'PROCESSING_ARTIFACT_INVALID' using errcode = 'P0001'; end if;
  if target.pdf_storage_path is not null and target.pdf_storage_path <> p_pdf_storage_path then
    insert into public.processing_artifacts(job_id, recording_key, kind, storage_path, state, origin)
      values (p_job_id, p_recording_id, 'pdf', target.pdf_storage_path, 'superseded', 'legacy')
      on conflict (storage_path) do update set state = case
        when public.processing_artifacts.state in ('deleting', 'deleted') then public.processing_artifacts.state
        else 'superseded' end;
  end if;
  update public.recordings set pdf_storage_path = p_pdf_storage_path,
    pdf_generated_at = p_pdf_generated_at, pdf_version = p_pdf_version, status = 'pdf_saved'
    where id = p_recording_id returning * into target;
  update public.recording_processing_jobs set state = 'completed',
    result = jsonb_build_object(
      'recording_id', p_recording_id, 'pdf_storage_path', p_pdf_storage_path,
      'status', 'pdf_saved', 'pdf_generated_at', p_pdf_generated_at, 'pdf_version', p_pdf_version
    ), lease_token = null, lease_expires_at = null, completed_at = now(), updated_at = now()
    where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  return target;
end;
$$;

create or replace function public.complete_transcription_with_processing_lock(
  p_job_id uuid, p_lease_token uuid, p_recording_id uuid, p_doctor_id uuid,
  p_transcript text, p_audio_storage_path text, p_input_hash text
)
returns public.recordings language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target public.recordings%rowtype;
  job public.recording_processing_jobs%rowtype;
begin
  if nullif(btrim(p_transcript), '') is null or nullif(p_audio_storage_path, '') is null then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));
  select * into job from public.recording_processing_jobs j where j.id = p_job_id for update;
  if job.id is null or job.operation <> 'transcription' or job.recording_key <> p_recording_id
     or job.input_hash <> p_input_hash or job.state <> 'running' or job.lease_token <> p_lease_token
     or job.lease_expires_at <= now()
  then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.transcription_chunks chunk where chunk.job_id = p_job_id)
     or exists (select 1 from public.transcription_chunks chunk where chunk.job_id = p_job_id and chunk.state <> 'completed')
     or exists (select 1 from public.transcription_chunks chunk where chunk.job_id = p_job_id and chunk.storage_path <> p_audio_storage_path)
     or not exists (
       select 1 from public.processing_artifacts artifact where artifact.job_id = p_job_id
         and artifact.kind = 'audio' and artifact.storage_path = p_audio_storage_path
         and artifact.checksum = p_input_hash and artifact.state = 'current'
     ) then raise exception 'TRANSCRIPTION_MANIFEST_INCOMPLETE' using errcode = 'P0001'; end if;
  select * into target from public.recordings r
    where r.id = p_recording_id and r.doctor_id = p_doctor_id for update;
  if target.id is null or target.status <> 'recorded' then
    raise exception 'RECORDING_NOT_TRANSCRIBABLE' using errcode = 'P0001';
  end if;
  if target.audio_storage_path is not null and target.audio_storage_path <> p_audio_storage_path then
    insert into public.processing_artifacts(job_id, recording_key, kind, storage_path, state, origin)
      values (p_job_id, p_recording_id, 'audio', target.audio_storage_path, 'superseded', 'legacy')
      on conflict (storage_path) do update set state = case
        when public.processing_artifacts.state in ('deleting', 'deleted') then public.processing_artifacts.state
        else 'superseded' end;
  end if;
  update public.recordings set audio_storage_path = p_audio_storage_path, transcript = p_transcript,
    summary = null, pdf_storage_path = null, pdf_generated_at = null, pdf_version = null, status = 'transcribed'
  where id = p_recording_id and doctor_id = p_doctor_id and status = 'recorded' returning * into target;
  update public.recording_processing_jobs set state = 'completed',
    result = jsonb_build_object(
      'recording_id', p_recording_id, 'audio_storage_path', p_audio_storage_path,
      'status', 'transcribed', 'input_hash', p_input_hash
    ), lease_token = null, lease_expires_at = null, completed_at = now(), updated_at = now()
    where id = p_job_id and state = 'running' and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
  return target;
end;
$$;

create or replace view public.processing_cost_metrics as
select date_trunc('day', created_at) as metric_day, clinic_key as clinic_id, operation, provider,
  count(*) as jobs, sum(attempt - 1) as retries, sum(provider_calls) as provider_calls,
  sum(transcription_seconds) / 60.0 as transcription_minutes,
  sum(provider_latency_ms) as provider_latency_ms, sum(estimated_cost_usd) as estimated_cost_usd,
  sum(failure_count) as failures
from public.recording_processing_jobs
group by 1, 2, 3, 4;

revoke all on public.recording_processing_jobs, public.processing_usage_reservations,
  public.transcription_chunks, public.processing_artifacts, public.processing_cost_metrics from anon, authenticated;
grant select on public.recording_processing_jobs, public.transcription_chunks,
  public.processing_artifacts, public.processing_cost_metrics to service_role;
revoke all on function public.claim_recording_processing_job(text,text,text,uuid,uuid,uuid,numeric,bigint),
  public.save_transcription_chunk_manifest(uuid,uuid,uuid,jsonb),
  public.mark_processing_provider_submitted(uuid,uuid,text,integer),
  public.heartbeat_recording_processing_job(uuid,uuid),
  public.complete_transcription_chunk(uuid,uuid,integer,text),
  public.record_processing_provider_call(uuid,uuid,text,bigint,numeric),
  public.complete_recording_processing_job(uuid,uuid,jsonb),
  public.fail_recording_processing_job(uuid,uuid,text),
  public.record_processing_artifact(uuid,uuid,text,text,bigint,text,text),
  public.mark_processing_artifact_ready(uuid,uuid,text), public.invalidate_completed_processing_job(uuid,text,text),
  public.supersede_processing_artifacts(uuid,text,text),
  public.mark_processing_artifact_orphaned(text) from public, anon, authenticated;
revoke all on function public.claim_processing_artifact_cleanup(integer,text[]),
  public.complete_processing_artifact_cleanup(text,uuid),
  public.release_processing_artifact_cleanup(text,uuid) from public, anon, authenticated;
revoke all on function public.save_recording_summary_with_processing_lock(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.save_generated_summary_with_processing_lock(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.save_generated_pdf_with_processing_lock(uuid,uuid,uuid,uuid,text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.complete_transcription_with_processing_lock(uuid,uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_recording_processing_job(text,text,text,uuid,uuid,uuid,numeric,bigint),
  public.save_transcription_chunk_manifest(uuid,uuid,uuid,jsonb),
  public.mark_processing_provider_submitted(uuid,uuid,text,integer),
  public.heartbeat_recording_processing_job(uuid,uuid),
  public.complete_transcription_chunk(uuid,uuid,integer,text),
  public.record_processing_provider_call(uuid,uuid,text,bigint,numeric),
  public.complete_recording_processing_job(uuid,uuid,jsonb),
  public.fail_recording_processing_job(uuid,uuid,text),
  public.record_processing_artifact(uuid,uuid,text,text,bigint,text,text),
  public.mark_processing_artifact_ready(uuid,uuid,text), public.invalidate_completed_processing_job(uuid,text,text),
  public.supersede_processing_artifacts(uuid,text,text),
  public.mark_processing_artifact_orphaned(text) to service_role;
grant execute on function public.claim_processing_artifact_cleanup(integer,text[]),
  public.complete_processing_artifact_cleanup(text,uuid),
  public.release_processing_artifact_cleanup(text,uuid) to service_role;
grant execute on function public.save_recording_summary_with_processing_lock(uuid,uuid,text,text) to service_role;
grant execute on function public.save_generated_summary_with_processing_lock(uuid,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.save_generated_pdf_with_processing_lock(uuid,uuid,uuid,uuid,text,text,timestamptz,text) to service_role;
grant execute on function public.complete_transcription_with_processing_lock(uuid,uuid,uuid,uuid,text,text,text) to service_role;
