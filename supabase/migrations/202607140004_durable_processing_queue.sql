-- Durable queue execution primitives for request-decoupled AI/PDF work.
create or replace view public.processing_job_status as
select id, doctor_key, clinic_key, operation, job_state, attempt, max_attempts,
  scheduled_at, started_at, completed_at, next_retry_at,
  job_state in ('running','cancel_requested') and lease_expires_at<=now() as is_stale,
  public.processing_job_safe_error_code(terminal_error_code) as terminal_error_code,
  public.processing_job_safe_error_message(terminal_error_code) as terminal_error_message
from public.recording_processing_jobs;

drop function if exists public.enqueue_recording_processing_job(text,text,text,uuid,uuid,uuid,numeric,bigint);

create or replace function public.enqueue_recording_processing_job(
  p_operation text,
  p_idempotency_key text,
  p_input_hash text,
  p_recording_id uuid,
  p_doctor_id uuid,
  p_clinic_id uuid,
  p_input_version integer default 1,
  p_transcription_seconds numeric default 0,
  p_storage_bytes bigint default 0,
  p_audio_storage_path text default null
)
returns table (
  id uuid, operation text, state text, job_state text, lease_token uuid,
  lease_expires_at timestamptz, attempt integer, max_attempts integer,
  result jsonb, input_hash text, input_version integer, scheduled_at timestamptz, started_at timestamptz,
  heartbeat_at timestamptz, next_retry_at timestamptz, completed_at timestamptz,
  terminal_error_code text, terminal_error_message text, output_reference jsonb,
  state_version bigint, created_at timestamptz, recording_key uuid,
  doctor_key uuid, clinic_key uuid, idempotency_key text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.recording_processing_jobs%rowtype;
  target public.recordings%rowtype;
begin
  if p_operation is null or p_operation not in ('transcription', 'summary', 'pdf')
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 120
     or p_input_hash is null or p_input_hash !~ '^[a-f0-9]{64}$'
     or p_input_version is null or p_input_version < 1
     or p_recording_id is null or p_doctor_id is null or p_clinic_id is null
     or p_transcription_seconds is null or p_transcription_seconds < 0
     or p_storage_bytes is null or p_storage_bytes < 0 then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text, 0));
  select * into target from public.recordings recording where recording.id = p_recording_id for update;
  if target.id is null or target.doctor_id <> p_doctor_id or target.clinic_id <> p_clinic_id then
    raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode = 'P0001';
  end if;
  if p_operation='transcription' and exists (select 1 from public.transcription_sessions session
    where session.recording_id=p_recording_id and session.state in ('accepting','processing')) then
    raise exception 'PROCESSING_RECORDING_BUSY' using errcode='P0001';
  end if;
  select * into existing
  from public.recording_processing_jobs job
  where job.doctor_key = p_doctor_id
    and job.operation = p_operation
    and job.idempotency_key = p_idempotency_key
  for update;

  if existing.id is not null and (existing.input_hash <> p_input_hash or existing.input_version<>p_input_version
      or existing.recording_key <> p_recording_id) then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
  end if;

  if existing.id is null then
    select * into existing
    from public.recording_processing_jobs job
    where job.recording_key = p_recording_id
      and job.operation = p_operation
      and job.input_hash = p_input_hash
      and job.input_version = p_input_version
    for update;
  end if;

  if existing.id is null and p_operation = 'transcription' and exists (
    select 1 from public.recording_processing_jobs job
    where job.recording_key = p_recording_id
      and job.operation = 'transcription'
      and job.input_hash <> p_input_hash
  ) then
    raise exception 'TRANSCRIPTION_MANIFEST_IMMUTABLE' using errcode = 'P0001';
  end if;

  if existing.id is null and (
    (p_operation = 'transcription' and target.status <> 'recorded')
    or (p_operation = 'summary' and nullif(btrim(target.transcript), '') is null)
    or (p_operation = 'pdf' and nullif(btrim(target.summary), '') is null)
  ) then
    raise exception 'PROCESSING_RECORDING_STATE_INVALID' using errcode = 'P0001';
  end if;
  if existing.id is null and p_operation = 'transcription' and (
    target.duration_seconds is null or target.duration_seconds < 0 or target.duration_seconds > 3600
    or abs(target.duration_seconds - p_transcription_seconds) > 0.01
  ) then
    raise exception 'PROCESSING_DURATION_INVALID' using errcode = 'P0001';
  end if;

  if existing.id is null and exists (
    select 1 from public.recording_processing_jobs active_job
    where active_job.recording_key = p_recording_id
      and active_job.job_state in ('queued', 'running', 'retry_wait', 'cancel_requested')
  ) then
    raise exception 'PROCESSING_RECORDING_BUSY' using errcode = 'P0001';
  end if;

  if existing.id is null then
    insert into public.recording_processing_jobs (
      recording_id, recording_key, doctor_id, doctor_key, clinic_id, clinic_key,
      operation, state, job_state, idempotency_key, input_hash, input_version,
      transcription_seconds, storage_bytes, scheduled_at
    ) values (
      p_recording_id, p_recording_id, p_doctor_id, p_doctor_id, p_clinic_id, p_clinic_id,
      p_operation, 'failed', 'queued', p_idempotency_key, p_input_hash, p_input_version,
      p_transcription_seconds, p_storage_bytes, now()
    ) returning * into existing;
  end if;

  if p_operation = 'transcription' and existing.job_state = 'queued' then
    if nullif(btrim(p_audio_storage_path), '') is null then
      raise exception 'PROCESSING_ARTIFACT_INVALID' using errcode = 'P0001';
    end if;
    insert into public.processing_artifacts(
      job_id, recording_key, kind, storage_path, byte_size, checksum, state
    ) values (
      existing.id, p_recording_id, 'audio', btrim(p_audio_storage_path), p_storage_bytes, p_input_hash, 'pending'
    ) on conflict (storage_path) do nothing;
    if not exists (
      select 1 from public.processing_artifacts artifact
      where artifact.job_id = existing.id and artifact.recording_key = p_recording_id
        and artifact.kind = 'audio' and artifact.storage_path = btrim(p_audio_storage_path)
        and artifact.byte_size = p_storage_bytes and artifact.checksum = p_input_hash
        and artifact.state in ('pending','current')
    ) then raise exception 'PROCESSING_ARTIFACT_CONFLICT' using errcode = 'P0001'; end if;
  end if;

  return query
    select job.id, job.operation, job.state, job.job_state, job.lease_token,
      job.lease_expires_at, job.attempt, job.max_attempts, job.result,
      job.input_hash, job.input_version, job.scheduled_at, job.started_at, job.heartbeat_at,
      job.next_retry_at, job.completed_at, job.terminal_error_code,
      job.terminal_error_message, job.output_reference, job.state_version,
      job.created_at, job.recording_key, job.doctor_key, job.clinic_key,
      job.idempotency_key
    from public.recording_processing_jobs job
    where job.id = existing.id;
end;
$$;

create or replace function public.activate_queued_transcription_artifact(
  p_job_id uuid, p_doctor_id uuid, p_clinic_id uuid, p_storage_path text, p_checksum text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  job public.recording_processing_jobs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_job_id::text, 0));
  select * into job from public.recording_processing_jobs where id = p_job_id for update;
  if job.id is null or job.operation <> 'transcription' or job.job_state <> 'queued'
     or job.doctor_key <> p_doctor_id or job.clinic_key <> p_clinic_id
     or job.input_hash <> p_checksum then
    raise exception 'PROCESSING_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  update public.processing_artifacts set state = 'current'
  where job_id = p_job_id and recording_key = job.recording_key and kind = 'audio'
    and storage_path = p_storage_path and checksum = p_checksum and state in ('pending', 'current');
  if not found then raise exception 'PROCESSING_ARTIFACT_INVALID' using errcode = 'P0001'; end if;
  update public.recordings set audio_storage_path = p_storage_path
  where id = job.recording_key and doctor_id = p_doctor_id and clinic_id = p_clinic_id and status = 'recorded';
  if not found then raise exception 'RECORDING_NOT_TRANSCRIBABLE' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.prevent_transcription_session_queue_collision()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.recording_id::text,0));
  if exists(select 1 from public.recording_processing_jobs job where job.recording_key=new.recording_id
    and job.operation='transcription' and job.job_state in ('queued','running','retry_wait','cancel_requested')) then
    raise exception 'TRANSCRIPTION_SESSION_ACTIVE' using errcode='P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_transcription_session_queue_collision on public.transcription_sessions;
create trigger prevent_transcription_session_queue_collision before insert on public.transcription_sessions
  for each row execute function public.prevent_transcription_session_queue_collision();

create or replace function public.claim_ready_recording_processing_jobs(
  p_worker_id text,
  p_operations text[],
  p_limit integer default 1
)
returns table (
  id uuid, operation text, state text, job_state text, lease_token uuid,
  lease_expires_at timestamptz, attempt integer, max_attempts integer,
  result jsonb, input_hash text, input_version integer, scheduled_at timestamptz, started_at timestamptz,
  heartbeat_at timestamptz, next_retry_at timestamptz, completed_at timestamptz,
  terminal_error_code text, terminal_error_message text, output_reference jsonb,
  state_version bigint, created_at timestamptz, recording_key uuid,
  doctor_key uuid, clinic_key uuid, idempotency_key text
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  claim_limit integer := least(greatest(coalesce(p_limit, 1), 1), 10);
  scope record;
begin
  if nullif(btrim(p_worker_id), '') is null or p_operations is null or cardinality(p_operations) = 0
     or exists (select 1 from unnest(p_operations) op where op not in ('transcription', 'summary', 'pdf')) then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;
  -- Current scale favors correctness over claim throughput: serialize admission
  -- so tenant concurrency, daily usage, and storage reservations are atomic.
  perform pg_advisory_xact_lock(6800, 1);
  for scope in select distinct job.clinic_key from public.recording_processing_jobs job
    where job.operation=any(p_operations) and job.job_state in ('queued','retry_wait') order by job.clinic_key
  loop perform pg_advisory_xact_lock(6201,hashtext(scope.clinic_key::text)); end loop;
  for scope in select distinct job.doctor_key from public.recording_processing_jobs job
    where job.operation=any(p_operations) and job.job_state in ('queued','retry_wait') order by job.doctor_key
  loop perform pg_advisory_xact_lock(6202,hashtext(scope.doctor_key::text)); end loop;

  return query
    with eligible as materialized (
      select job.id, job.clinic_key, job.scheduled_at, job.created_at
      from public.recording_processing_jobs job
      where job.operation = any(p_operations)
        and job.job_state in ('queued', 'retry_wait')
        and job.scheduled_at <= now()
        and (job.next_retry_at is null or job.next_retry_at <= now())
        and (
          (job.job_state = 'queued' and job.attempt <= job.max_attempts)
          or (job.job_state = 'retry_wait' and job.attempt < job.max_attempts)
        )
        and not exists (
          select 1 from public.recording_processing_jobs active_job
          where active_job.recording_key = job.recording_key
            and active_job.job_state in ('running', 'cancel_requested')
            and active_job.id <> job.id
        )
        and (job.operation <> 'transcription' or exists (
          select 1 from public.processing_artifacts input_artifact
          where input_artifact.recording_key = job.recording_key and input_artifact.kind = 'audio'
            and input_artifact.checksum = job.input_hash and input_artifact.state = 'current'
        ))
        and (job.operation<>'transcription' or not exists (select 1 from public.transcription_sessions session
          where session.recording_id=job.recording_key and session.state in ('accepting','processing')))
        and (
          select count(*) from public.recording_processing_jobs running_job
          where running_job.doctor_key = job.doctor_key
            and running_job.job_state in ('running', 'cancel_requested')
            and running_job.lease_expires_at > now()
        ) < 2
        and (
          select count(*) from public.recording_processing_jobs running_job
          where running_job.clinic_key = job.clinic_key
            and running_job.job_state in ('running', 'cancel_requested')
            and running_job.lease_expires_at > now()
        ) < 10
        and (
          (job.operation = 'transcription' and
            (select count(*) from public.processing_usage_reservations usage
              where usage.doctor_key = job.doctor_key and usage.operation = job.operation
                and usage.job_id <> job.id and usage.created_at >= now() - interval '1 day') < 24
            and (select count(*) from public.processing_usage_reservations usage
              where usage.clinic_key = job.clinic_key and usage.operation = job.operation
                and usage.job_id <> job.id and usage.created_at >= now() - interval '1 day') < 240
            and (select coalesce(sum(usage.transcription_seconds), 0)
              from public.processing_usage_reservations usage
              where usage.doctor_key = job.doctor_key
                and usage.job_id <> job.id and usage.created_at >= now() - interval '1 day') + job.transcription_seconds <= 14400
            and (select coalesce(sum(usage.transcription_seconds), 0)
              from public.processing_usage_reservations usage
              where usage.clinic_key = job.clinic_key
                and usage.job_id <> job.id and usage.created_at >= now() - interval '1 day') + job.transcription_seconds <= 144000
          )
          or (job.operation <> 'transcription' and
            (select count(*) from public.processing_usage_reservations usage
              where usage.doctor_key = job.doctor_key and usage.operation = job.operation
                and usage.job_id <> job.id and usage.created_at >= now() - interval '1 day') < 200
            and (select count(*) from public.processing_usage_reservations usage
              where usage.clinic_key = job.clinic_key and usage.operation = job.operation
                and usage.job_id <> job.id and usage.created_at >= now() - interval '1 day') < 2000
          )
        )
        and (
          select coalesce(sum(artifact.byte_size), 0)
          from public.processing_artifacts artifact
          join public.recording_processing_jobs artifact_job on artifact_job.id = artifact.job_id
          where artifact_job.doctor_key = job.doctor_key and artifact.state in ('pending', 'current')
        ) + case when exists (
          select 1 from public.processing_artifacts own_artifact
          where own_artifact.state in ('pending', 'current') and (
            own_artifact.job_id = job.id or (job.operation = 'transcription'
              and own_artifact.recording_key = job.recording_key and own_artifact.kind = 'audio'
              and own_artifact.checksum = job.input_hash)
          )
        ) then 0 else job.storage_bytes end <= 2147483648
        and (
          select coalesce(sum(artifact.byte_size), 0)
          from public.processing_artifacts artifact
          join public.recording_processing_jobs artifact_job on artifact_job.id = artifact.job_id
          where artifact_job.clinic_key = job.clinic_key and artifact.state in ('pending', 'current')
        ) + case when exists (
          select 1 from public.processing_artifacts own_artifact
          where own_artifact.state in ('pending', 'current') and (
            own_artifact.job_id = job.id or (job.operation = 'transcription'
              and own_artifact.recording_key = job.recording_key and own_artifact.kind = 'audio'
              and own_artifact.checksum = job.input_hash)
          )
        ) then 0 else job.storage_bytes end <= 21474836480
    ),
    clinic_first as (
      select distinct on (eligible.clinic_key) eligible.id
      from eligible
      order by eligible.clinic_key, eligible.scheduled_at, eligible.created_at, eligible.id
    ),
    candidates as (
      select job.id
      from public.recording_processing_jobs job
      join clinic_first on clinic_first.id = job.id
      order by job.scheduled_at, job.created_at, job.id
      for update of job skip locked
      limit claim_limit
    ),
    claimed as (
      update public.recording_processing_jobs job
      set job_state = 'running',
        state = 'running',
        attempt = case when job.job_state = 'retry_wait' then job.attempt + 1 else job.attempt end,
        lease_token = gen_random_uuid(),
        lease_expires_at = now() + interval '5 minutes',
        lease_owner = btrim(p_worker_id),
        error_code = null,
        terminal_error_code = null,
        terminal_error_message = null,
        next_retry_at = null,
        started_at = coalesce(job.started_at, now()),
        heartbeat_at = now(),
        updated_at = now()
      from candidates
      where job.id = candidates.id
      returning job.*
    ),
    reserved as (
      insert into public.processing_usage_reservations (
        job_id, doctor_key, clinic_key, operation, transcription_seconds, storage_bytes
      )
      select claimed.id, claimed.doctor_key, claimed.clinic_key, claimed.operation,
        claimed.transcription_seconds, claimed.storage_bytes
      from claimed
      on conflict (job_id) do nothing
      returning job_id
    )
    select claimed.id, claimed.operation, claimed.state, claimed.job_state,
      claimed.lease_token, claimed.lease_expires_at, claimed.attempt,
      claimed.max_attempts, claimed.result, claimed.input_hash, claimed.input_version,
      claimed.scheduled_at, claimed.started_at, claimed.heartbeat_at,
      claimed.next_retry_at, claimed.completed_at, claimed.terminal_error_code,
      claimed.terminal_error_message, claimed.output_reference,
      claimed.state_version, claimed.created_at, claimed.recording_key,
      claimed.doctor_key, claimed.clinic_key, claimed.idempotency_key
    from claimed;
end;
$$;

create or replace function public.processing_job_retry_at(p_attempt integer)
returns timestamptz language sql stable set search_path = public, pg_temp as $$
  select now() + make_interval(secs => least(900, (30 * power(2, greatest(coalesce(p_attempt, 1), 1) - 1))::integer))
$$;

create or replace function public.processing_job_error_retryable(p_error_code text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_error_code, 'INTERNAL_ERROR') not in (
    'AUDIO_REQUIRED', 'AUDIO_TOO_LARGE', 'AUDIO_TYPE_INVALID',
    'IDEMPOTENCY_KEY_REUSED', 'PATIENT_ID_REQUIRED', 'PDF_TOO_LARGE',
    'PROCESSING_ARTIFACT_CONFLICT', 'PROCESSING_ARTIFACT_INCONSISTENT',
    'PROCESSING_INPUT_CHANGED', 'PROCESSING_INPUT_INVALID',
    'PROCESSING_OUTPUT_REPLACED', 'PROCESSING_RECORDING_SCOPE_INVALID',
    'PROCESSING_RECORDING_STATE_INVALID', 'PROVIDER_TERMINAL',
    'CLINIC_NOT_FOUND', 'RECORDING_DURATION_INVALID', 'RECORDING_NOT_FOUND',
    'RECORDING_NOT_TRANSCRIBABLE', 'SUMMARY_REQUIRED',
    'SUMMARY_INPUT_INVALID', 'TRANSCRIPT_REQUIRED', 'TRANSCRIPTION_AUDIO_CHANGED',
    'TRANSCRIPTION_MANIFEST_IMMUTABLE', 'TRANSCRIPTION_MANIFEST_INVALID'
  )
$$;

create or replace function public.fail_recording_processing_job(p_job_id uuid, p_lease_token uuid, p_error_code text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  job public.recording_processing_jobs%rowtype;
  retryable boolean;
begin
  select * into job from public.recording_processing_jobs
  where id = p_job_id and state = 'running' and job_state in ('running', 'cancel_requested')
    and lease_token = p_lease_token and lease_expires_at > now()
  for update;
  if job.id is null then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;

  retryable := job.job_state<>'cancel_requested' and public.processing_job_error_retryable(p_error_code)
    and job.attempt < job.max_attempts;
  update public.recording_processing_jobs set
    state = 'failed',
    job_state = case when job.job_state='cancel_requested' then 'cancelled'
      when retryable then 'retry_wait' else 'failed_terminal' end,
    error_code = left(coalesce(p_error_code, 'INTERNAL_ERROR'), 120),
    terminal_error_code = case when job.job_state='cancel_requested' then 'PROCESSING_CANCELLED'
      else coalesce(public.processing_job_safe_error_code(p_error_code), 'PROCESSING_FAILED') end,
    terminal_error_message = public.processing_job_safe_error_message(
      case when job.job_state='cancel_requested' then 'PROCESSING_CANCELLED'
        else coalesce(public.processing_job_safe_error_code(p_error_code), 'PROCESSING_FAILED') end
    ),
    next_retry_at = case when retryable then public.processing_job_retry_at(job.attempt) else null end,
    failure_count = failure_count + 1,
    lease_token = null,
    lease_expires_at = null,
    lease_owner = null,
    cancelled_at=case when job.job_state='cancel_requested' then now() else null end,
    completed_at = case when retryable then null else now() end,
    updated_at = now()
  where id = job.id;
end;
$$;

create or replace function public.recover_stale_recording_processing_jobs(
  p_before timestamptz,
  p_retry_at timestamptz,
  p_limit integer default 25
)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  recovered integer;
  abandoned integer;
begin
  if p_before is null or p_retry_at is null then
    raise exception 'PROCESSING_INPUT_INVALID' using errcode = 'P0001';
  end if;

  with abandoned_jobs as (
    select job.id from public.recording_processing_jobs job
    where job.operation='transcription' and job.job_state='queued'
      and job.created_at<=now()-interval '15 minutes'
      and exists(select 1 from public.processing_artifacts artifact
        where artifact.job_id=job.id and artifact.state='pending')
    order by job.created_at,job.id for update skip locked
    limit least(greatest(coalesce(p_limit,25),1),100)
  )
  update public.recording_processing_jobs job set job_state='cancelled',state='failed',
    terminal_error_code='PROCESSING_CANCELLED',
    terminal_error_message=public.processing_job_safe_error_message('PROCESSING_CANCELLED'),
    cancelled_at=now(),completed_at=now(),updated_at=now()
  from abandoned_jobs where job.id=abandoned_jobs.id;
  get diagnostics abandoned=row_count;
  update public.processing_artifacts artifact set state='orphaned'
    from public.recording_processing_jobs job where artifact.job_id=job.id
      and artifact.state='pending' and job.job_state='cancelled';

  with stale as (
    select job.id
    from public.recording_processing_jobs job
    where job.job_state in ('running', 'cancel_requested')
      and job.lease_expires_at <= least(p_before,now())
    order by job.lease_expires_at, job.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  update public.recording_processing_jobs job
  set job_state = case
      when job.job_state = 'cancel_requested' then 'cancelled'
      when job.attempt < job.max_attempts then 'retry_wait'
      else 'failed_terminal'
    end,
    state = 'failed',
    error_code = case when job.job_state = 'cancel_requested' then 'PROCESSING_CANCELLED' else 'PROCESSING_LEASE_EXPIRED' end,
    terminal_error_code = case when job.job_state = 'cancel_requested' then 'PROCESSING_CANCELLED' else 'PROCESSING_LEASE_EXPIRED' end,
    terminal_error_message = public.processing_job_safe_error_message(
      case when job.job_state = 'cancel_requested' then 'PROCESSING_CANCELLED' else 'PROCESSING_LEASE_EXPIRED' end
    ),
    next_retry_at = case when job.job_state <> 'cancel_requested' and job.attempt < job.max_attempts
      then greatest(p_retry_at,now()+interval '1 second') else null end,
    lease_token = null,
    lease_expires_at = null,
    lease_owner = null,
    failure_count = job.failure_count + 1,
    cancelled_at = case when job.job_state = 'cancel_requested' then now() else null end,
    completed_at = case when job.job_state <> 'cancel_requested' and job.attempt < job.max_attempts then null else now() end,
    updated_at = now()
  from stale
  where job.id = stale.id;

  get diagnostics recovered = row_count;

  update public.processing_artifacts artifact
  set state = 'orphaned'
  from public.recording_processing_jobs job
  where artifact.job_id = job.id and artifact.state = 'pending' and job.job_state = 'cancelled';

  return recovered+abandoned;
end;
$$;

create or replace view public.processing_queue_metrics as
select operation, job_state, count(*)::bigint as jobs,
  coalesce(max(extract(epoch from (now() - coalesce(next_retry_at,scheduled_at,created_at)))) filter (
    where job_state in ('queued', 'retry_wait') and scheduled_at<=now()
      and (next_retry_at is null or next_retry_at<=now())
  ), 0)::bigint as oldest_queue_age_seconds,
  count(*) filter (
    where job_state in ('running', 'cancel_requested') and lease_expires_at <= now()
  )::bigint as stale_jobs,
  coalesce(avg(extract(epoch from (started_at - created_at))) filter (where started_at is not null), 0) as average_wait_seconds,
  coalesce(avg(extract(epoch from (completed_at - started_at))) filter (
    where completed_at is not null and started_at is not null
  ), 0) as average_run_seconds,
  sum(failure_count)::bigint as failures,
  sum(provider_calls)::bigint as provider_calls,
  sum(estimated_cost_usd) as estimated_cost_usd
from public.recording_processing_jobs
group by operation, job_state;

revoke all on public.processing_job_status, public.processing_queue_metrics from public, anon, authenticated;
grant select on public.processing_job_status, public.processing_queue_metrics to service_role;

revoke all on function public.enqueue_recording_processing_job(text,text,text,uuid,uuid,uuid,integer,numeric,bigint,text),
  public.activate_queued_transcription_artifact(uuid,uuid,uuid,text,text),
  public.prevent_transcription_session_queue_collision(),
  public.claim_ready_recording_processing_jobs(text,text[],integer),
  public.recover_stale_recording_processing_jobs(timestamptz,timestamptz,integer),
  public.processing_job_retry_at(integer),
  public.processing_job_error_retryable(text)
  from public, anon, authenticated;
grant execute on function public.enqueue_recording_processing_job(text,text,text,uuid,uuid,uuid,integer,numeric,bigint,text),
  public.activate_queued_transcription_artifact(uuid,uuid,uuid,text,text),
  public.claim_ready_recording_processing_jobs(text,text[],integer),
  public.recover_stale_recording_processing_jobs(timestamptz,timestamptz,integer),
  public.processing_job_retry_at(integer),
  public.processing_job_error_retryable(text)
  to service_role;
