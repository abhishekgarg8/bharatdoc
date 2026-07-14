-- Canonical lifecycle for durable processing jobs. The original state column
-- remains a compatibility shadow for currently deployed request-path workers.
alter table public.recording_processing_jobs
  add column if not exists job_state text,
  add column if not exists input_version integer not null default 1,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists scheduled_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists lease_owner text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists terminal_error_code text,
  add column if not exists terminal_error_message text,
  add column if not exists output_reference jsonb,
  add column if not exists state_version bigint not null default 0;

alter table public.recording_processing_jobs
  drop constraint if exists processing_job_lease_state_check;

create or replace function public.processing_job_safe_error_code(p_error_code text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p_error_code
    when 'PROCESSING_LEASE_EXPIRED' then p_error_code
    when 'PROCESSING_INPUT_CHANGED' then p_error_code
    when 'PROCESSING_OUTPUT_REPLACED' then p_error_code
    when 'PROCESSING_ARTIFACT_SUPERSEDED' then p_error_code
    when 'PROCESSING_CANCELLED' then p_error_code
    when 'PROCESSING_ATTEMPTS_EXHAUSTED' then p_error_code
    when 'PROVIDER_RETRYABLE' then p_error_code
    when 'PROVIDER_TERMINAL' then p_error_code
    when 'PROCESSING_FAILED' then p_error_code
    else case when p_error_code is null then null else 'PROCESSING_FAILED' end
  end;
$$;

create or replace function public.processing_job_safe_error_message(p_error_code text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case public.processing_job_safe_error_code(p_error_code)
    when 'PROCESSING_LEASE_EXPIRED' then 'The worker lease expired before processing completed.'
    when 'PROCESSING_INPUT_CHANGED' then 'The recording changed before processing completed.'
    when 'PROCESSING_OUTPUT_REPLACED' then 'A newer recording output replaced this result.'
    when 'PROCESSING_ARTIFACT_SUPERSEDED' then 'The stored output changed and will be regenerated.'
    when 'PROCESSING_CANCELLED' then 'Processing was cancelled.'
    when 'PROCESSING_ATTEMPTS_EXHAUSTED' then 'Processing could not be completed after multiple attempts.'
    when 'PROVIDER_RETRYABLE' then 'The processing provider is temporarily unavailable.'
    when 'PROVIDER_TERMINAL' then 'The processing provider could not complete this job.'
    when 'PROCESSING_FAILED' then 'Processing could not be completed.'
    else null
  end;
$$;

with ranked as (
  select job.id, job.state, job.operation, job.attempt, greatest(job.max_attempts,job.attempt) as max_attempts,
    job.completed_at, job.error_code, recording.status as recording_status,
    row_number() over (partition by job.recording_key order by job.updated_at desc, job.created_at desc, job.id) as failed_rank,
    bool_or(job.state = 'running') over (partition by job.recording_key) as has_running
  from public.recording_processing_jobs as job
  left join public.recordings as recording on recording.id=job.recording_key
)
update public.recording_processing_jobs job set
  job_state = case
    when ranked.state = 'completed' and case ranked.operation
      when 'transcription' then ranked.recording_status in ('transcribed','summary_ready','pdf_saved')
      when 'summary' then ranked.recording_status in ('summary_ready','pdf_saved')
      when 'pdf' then ranked.recording_status='pdf_saved' end then 'succeeded'
    when ranked.state = 'completed' then 'failed_terminal'
    when ranked.state = 'failed' and ranked.attempt < ranked.max_attempts
      and (ranked.completed_at is null or ranked.error_code = 'PROCESSING_ARTIFACT_SUPERSEDED')
      and coalesce(ranked.error_code, '') not in ('PROCESSING_INPUT_CHANGED', 'PROCESSING_OUTPUT_REPLACED')
      and not ranked.has_running and ranked.failed_rank = 1 then 'retry_wait'
    when ranked.state = 'failed' then 'failed_terminal'
    else 'running'
  end,
  max_attempts=ranked.max_attempts,
  state=case when ranked.state='completed' and case ranked.operation
      when 'transcription' then ranked.recording_status in ('transcribed','summary_ready','pdf_saved')
      when 'summary' then ranked.recording_status in ('summary_ready','pdf_saved')
      when 'pdf' then ranked.recording_status='pdf_saved' end then 'completed'
    when ranked.state='running' or (ranked.state='failed' and ranked.attempt<ranked.max_attempts
      and (ranked.completed_at is null or ranked.error_code='PROCESSING_ARTIFACT_SUPERSEDED')
      and coalesce(ranked.error_code,'') not in ('PROCESSING_INPUT_CHANGED','PROCESSING_OUTPUT_REPLACED')
      and not ranked.has_running and ranked.failed_rank=1) then 'running' else 'failed' end,
  scheduled_at = coalesce(job.scheduled_at, job.created_at),
  started_at = case when ranked.state = 'running' then coalesce(job.started_at, job.created_at) else job.started_at end,
  heartbeat_at = case when ranked.state = 'running' then coalesce(job.heartbeat_at, job.updated_at) else job.heartbeat_at end,
  next_retry_at = case
    when ranked.state = 'failed' and ranked.attempt < ranked.max_attempts
      and (ranked.completed_at is null or ranked.error_code = 'PROCESSING_ARTIFACT_SUPERSEDED')
      and coalesce(ranked.error_code, '') not in ('PROCESSING_INPUT_CHANGED', 'PROCESSING_OUTPUT_REPLACED')
      and not ranked.has_running and ranked.failed_rank = 1 then coalesce(job.next_retry_at, now())
    else job.next_retry_at
  end,
  lease_owner = case when ranked.state = 'running' then coalesce(job.lease_owner, 'legacy-worker') else null end,
  terminal_error_code = case when ranked.state = 'completed' and not case ranked.operation
      when 'transcription' then ranked.recording_status in ('transcribed','summary_ready','pdf_saved')
      when 'summary' then ranked.recording_status in ('summary_ready','pdf_saved')
      when 'pdf' then ranked.recording_status='pdf_saved' end then 'PROCESSING_OUTPUT_REPLACED'
    when ranked.state = 'failed' then
    coalesce(public.processing_job_safe_error_code(job.error_code),
      case when ranked.attempt >= ranked.max_attempts then 'PROCESSING_ATTEMPTS_EXHAUSTED' else 'PROCESSING_FAILED' end)
    else null
  end,
  terminal_error_message = case when ranked.state = 'completed' and not case ranked.operation
      when 'transcription' then ranked.recording_status in ('transcribed','summary_ready','pdf_saved')
      when 'summary' then ranked.recording_status in ('summary_ready','pdf_saved')
      when 'pdf' then ranked.recording_status='pdf_saved' end
      then public.processing_job_safe_error_message('PROCESSING_OUTPUT_REPLACED')
    when ranked.state = 'failed' then
    public.processing_job_safe_error_message(coalesce(job.error_code,
      case when ranked.attempt >= ranked.max_attempts then 'PROCESSING_ATTEMPTS_EXHAUSTED' else 'PROCESSING_FAILED' end))
    else null
  end,
  output_reference = case when ranked.state='completed' and case ranked.operation
      when 'transcription' then ranked.recording_status in ('transcribed','summary_ready','pdf_saved')
      when 'summary' then ranked.recording_status in ('summary_ready','pdf_saved')
      when 'pdf' then ranked.recording_status='pdf_saved' end
    then jsonb_build_object('recording_status',case ranked.operation when 'transcription' then 'transcribed'
      when 'summary' then 'summary_ready' when 'pdf' then 'pdf_saved' end) else null end,
  completed_at = case when ranked.state in ('completed', 'failed') and not (
    ranked.state = 'failed' and ranked.attempt < ranked.max_attempts
      and (ranked.completed_at is null or ranked.error_code = 'PROCESSING_ARTIFACT_SUPERSEDED')
      and coalesce(ranked.error_code, '') not in ('PROCESSING_INPUT_CHANGED', 'PROCESSING_OUTPUT_REPLACED')
      and not ranked.has_running and ranked.failed_rank = 1
    ) then coalesce(job.completed_at, job.updated_at) else null end
from ranked
where ranked.id = job.id;

alter table public.recording_processing_jobs
  alter column job_state set not null,
  alter column job_state set default 'queued',
  alter column scheduled_at set not null,
  alter column scheduled_at set default now(),
  add constraint processing_job_lifecycle_state_check check (
    job_state in ('queued', 'running', 'retry_wait', 'succeeded', 'failed_terminal', 'cancel_requested', 'cancelled')
  ),
  add constraint processing_job_input_version_check check (input_version>0),
  add constraint processing_job_attempt_policy_check check (max_attempts>=1 and attempt between 1 and max_attempts),
  add constraint processing_job_retry_timing_check check ((job_state = 'retry_wait') = (next_retry_at is not null)),
  add constraint processing_job_terminal_time_check check (
    (job_state in ('succeeded', 'failed_terminal', 'cancelled')) = (completed_at is not null)
  ),
  add constraint processing_job_cancellation_time_check check ((job_state = 'cancelled') = (cancelled_at is not null)),
  add constraint processing_job_canonical_lease_check check (
    (job_state in ('running', 'cancel_requested') and lease_token is not null and lease_expires_at is not null and lease_owner is not null)
    or (job_state not in ('running', 'cancel_requested') and lease_token is null and lease_expires_at is null and lease_owner is null)
  ),
  add constraint processing_job_legacy_shadow_check check (state=case
    when job_state in ('queued','running','retry_wait','cancel_requested') then 'running'
    when job_state='succeeded' then 'completed' else 'failed' end),
  add constraint processing_job_state_version_check check (state_version>=0),
  add constraint processing_job_terminal_error_code_check check (
    terminal_error_code is null or terminal_error_code ~ '^[A-Z][A-Z0-9_]{2,119}$'
  ),
  add constraint processing_job_terminal_error_message_check check (
    terminal_error_message is null or char_length(terminal_error_message) between 1 and 240
  ),
  add constraint processing_job_failure_error_check check (
    (job_state in ('retry_wait', 'failed_terminal', 'cancelled')) =
      (terminal_error_code is not null and terminal_error_message is not null)
  ),
  add constraint processing_job_error_message_canonical_check check (
    terminal_error_message is not distinct from public.processing_job_safe_error_message(terminal_error_code)
  ),
  add constraint processing_job_output_reference_check check (
    (job_state='succeeded')=(output_reference is not null)
    and (output_reference is null or (jsonb_typeof(output_reference)='object'
      and output_reference-'recording_status'-'artifact_id'-'artifact_hash'='{}'::jsonb
      and output_reference->>'recording_status' in ('transcribed','summary_ready','pdf_saved')
      and (not (output_reference?'artifact_id') or output_reference->>'artifact_id'~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
      and (not (output_reference?'artifact_hash') or output_reference->>'artifact_hash'~'^[a-f0-9]{64}$')))
  );

drop index if exists public.idx_processing_jobs_one_active_recording;
create unique index if not exists idx_processing_jobs_one_active_recording_v2
  on public.recording_processing_jobs(recording_key)
  where job_state in ('queued', 'running', 'retry_wait', 'cancel_requested');
create index if not exists idx_processing_jobs_ready
  on public.recording_processing_jobs(job_state, scheduled_at, id)
  where job_state in ('queued', 'retry_wait');
create index if not exists idx_processing_jobs_stale_lease
  on public.recording_processing_jobs(lease_expires_at, id)
  where job_state in ('running', 'cancel_requested');
create index if not exists idx_processing_jobs_recording_operation_history
  on public.recording_processing_jobs(recording_key, operation, created_at desc);

create table if not exists public.processing_job_attempts (
  job_id uuid not null references public.recording_processing_jobs(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  lease_owner text not null,
  lease_expires_at timestamptz not null,
  started_at timestamptz not null,
  heartbeat_at timestamptz not null,
  ended_at timestamptz,
  outcome_state text check (outcome_state is null or outcome_state in
    ('retry_wait', 'succeeded', 'failed_terminal', 'cancel_requested', 'cancelled')),
  error_code text check (error_code is null or error_code ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  primary key (job_id, attempt)
);
create index if not exists idx_processing_job_attempts_open
  on public.processing_job_attempts(lease_expires_at, job_id)
  where ended_at is null;

create table if not exists public.processing_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.recording_processing_jobs(id) on delete cascade,
  from_state text,
  to_state text not null,
  attempt integer not null,
  state_version bigint not null,
  event_code text not null check (event_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  occurred_at timestamptz not null default now()
);
create index if not exists idx_processing_job_events_history
  on public.processing_job_events(job_id, occurred_at, id);

alter table public.processing_job_attempts enable row level security;
alter table public.processing_job_events enable row level security;

create or replace function public.processing_job_transition_allowed(p_from text,p_to text)
returns boolean language sql immutable set search_path=public,pg_temp as $$
  select case p_from when 'queued' then p_to in ('running','cancelled')
    when 'running' then p_to in ('succeeded','retry_wait','failed_terminal','cancel_requested')
    when 'retry_wait' then p_to in ('running','cancelled')
    when 'cancel_requested' then p_to in ('succeeded','failed_terminal','cancelled') else false end;
$$;

create or replace function public.sync_legacy_processing_job_state()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  previous_state text; expected_status text; recording_status text;
begin
  if tg_op = 'INSERT' then
    new.job_state:=case when new.job_state='queued' and new.lease_token is not null then 'running'
      when new.job_state is not null then new.job_state
      when new.state='completed' then 'succeeded' when new.state='failed' then 'failed_terminal' else 'running' end;
    new.state_version:=0;
  else
    previous_state:=old.job_state;
    if old.job_state in ('succeeded','failed_terminal','cancelled')
       and new.job_state is distinct from old.job_state then
      raise exception 'PROCESSING_TRANSITION_INVALID' using errcode='P0001';
    end if;
    if new.job_state is not distinct from old.job_state then
      if new.state is distinct from old.state then
        new.job_state:=case new.state when 'completed' then 'succeeded' when 'failed' then case
          when new.error_code in ('PROCESSING_INPUT_CHANGED','PROCESSING_OUTPUT_REPLACED')
            or old.job_state='cancel_requested' or new.attempt>=new.max_attempts then 'failed_terminal'
          else 'retry_wait' end else 'running' end;
      elsif old.job_state in ('queued','retry_wait') and old.lease_token is null and new.lease_token is not null then
        new.job_state:='running';
      end if;
    end if;
    if new.job_state is distinct from old.job_state
       and not public.processing_job_transition_allowed(old.job_state,new.job_state) then
      raise exception 'PROCESSING_TRANSITION_INVALID' using errcode='P0001';
    end if;
    if new.job_state='running' and old.job_state='queued' and old.scheduled_at>now() then
      raise exception 'PROCESSING_NOT_READY' using errcode='P0001';
    end if;
    if new.job_state='running' and old.job_state='retry_wait' then
      if old.next_retry_at>now() then raise exception 'PROCESSING_NOT_READY' using errcode='P0001'; end if;
      if new.attempt<>old.attempt+1 then raise exception 'PROCESSING_ATTEMPT_INVALID' using errcode='P0001'; end if;
    elsif new.attempt<>old.attempt then
      raise exception 'PROCESSING_ATTEMPT_INVALID' using errcode='P0001';
    end if;
    new.state_version:=case when new.job_state is distinct from old.job_state
      then old.state_version+1 else old.state_version end;
  end if;

  new.scheduled_at := coalesce(new.scheduled_at, now());
  if new.job_state in ('running', 'cancel_requested') then
    new.started_at:=coalesce(new.started_at,now());
    new.heartbeat_at:=coalesce(new.heartbeat_at,now());
    new.lease_owner:=coalesce(nullif(btrim(new.lease_owner),''),'legacy-worker');
    new.next_retry_at := null;
  else
    new.lease_token := null;
    new.lease_expires_at := null;
    new.lease_owner := null;
  end if;
  if new.job_state = 'retry_wait' then
    new.next_retry_at:=coalesce(new.next_retry_at,now()+interval '30 seconds');
  end if;
  if new.job_state in ('retry_wait', 'failed_terminal', 'cancelled') then
    new.terminal_error_code := coalesce(public.processing_job_safe_error_code(new.terminal_error_code),
      public.processing_job_safe_error_code(new.error_code),
      case when new.job_state = 'cancelled' then 'PROCESSING_CANCELLED' else 'PROCESSING_FAILED' end);
    new.terminal_error_message := public.processing_job_safe_error_message(new.terminal_error_code);
  else
    new.terminal_error_code := null;
    new.terminal_error_message := null;
  end if;
  if new.job_state='succeeded' then
    expected_status:=case new.operation when 'transcription' then 'transcribed'
      when 'summary' then 'summary_ready' when 'pdf' then 'pdf_saved' end;
    new.output_reference:=coalesce(new.output_reference,jsonb_build_object('recording_status',expected_status));
    select recording.status into recording_status from public.recordings as recording
      where recording.id=new.recording_key;
    if new.output_reference->>'recording_status'<>expected_status or (case expected_status
      when 'transcribed' then recording_status not in ('transcribed','summary_ready','pdf_saved')
      when 'summary_ready' then recording_status not in ('summary_ready','pdf_saved')
      when 'pdf_saved' then recording_status<>'pdf_saved' end) then
      raise exception 'PROCESSING_ARTIFACT_INCONSISTENT' using errcode = 'P0001';
    end if;
  else
    new.output_reference:=null;
  end if;
  if new.job_state in ('succeeded', 'failed_terminal', 'cancelled') then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;
  if new.job_state = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    new.cancelled_at := null;
  end if;
  new.state:=case when new.job_state in ('queued','running','retry_wait','cancel_requested') then 'running'
    when new.job_state='succeeded' then 'completed' else 'failed' end;
  return new;
end;
$$;

create or replace function public.record_processing_job_lifecycle_event()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into public.processing_job_events(job_id, from_state, to_state, attempt, state_version, event_code)
    values (new.id, null, new.job_state, new.attempt, new.state_version, 'JOB_CREATED');
  elsif new.job_state is distinct from old.job_state then
    insert into public.processing_job_events(job_id, from_state, to_state, attempt, state_version, event_code)
    values (new.id, old.job_state, new.job_state, new.attempt, new.state_version, 'STATE_TRANSITION');
  end if;
  if new.job_state in ('running', 'cancel_requested') then
    insert into public.processing_job_attempts(job_id, attempt, lease_owner, lease_expires_at, started_at, heartbeat_at)
    values (new.id, new.attempt, new.lease_owner, new.lease_expires_at,
      coalesce(new.started_at, now()), coalesce(new.heartbeat_at, now()))
    on conflict (job_id, attempt) do update set
      lease_owner = excluded.lease_owner,
      lease_expires_at = excluded.lease_expires_at,
      heartbeat_at = excluded.heartbeat_at;
  end if;
  if tg_op = 'UPDATE' then
    if old.job_state in ('running', 'cancel_requested') and new.job_state not in ('running', 'cancel_requested') then
      update public.processing_job_attempts set ended_at = now(), outcome_state = new.job_state,
        error_code = new.terminal_error_code
      where job_id = new.id and attempt = old.attempt;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_legacy_processing_job_state on public.recording_processing_jobs;
create trigger sync_legacy_processing_job_state
  before insert or update on public.recording_processing_jobs
  for each row execute function public.sync_legacy_processing_job_state();
drop trigger if exists record_processing_job_lifecycle_event on public.recording_processing_jobs;
create trigger record_processing_job_lifecycle_event
  after insert or update on public.recording_processing_jobs
  for each row execute function public.record_processing_job_lifecycle_event();

insert into public.processing_job_events(job_id, from_state, to_state, attempt, state_version, event_code, occurred_at)
select id, null, job_state, attempt, state_version, 'MIGRATED_STATE', updated_at
from public.recording_processing_jobs
where not exists (
  select 1 from public.processing_job_events event where event.job_id = recording_processing_jobs.id
);

insert into public.processing_job_attempts(
  job_id, attempt, lease_owner, lease_expires_at, started_at, heartbeat_at, ended_at, outcome_state, error_code
)
select id, attempt, coalesce(lease_owner, 'legacy-worker'), coalesce(lease_expires_at, updated_at),
  coalesce(started_at, created_at), coalesce(heartbeat_at, updated_at),
  case when job_state in ('running', 'cancel_requested') then null else coalesce(completed_at, updated_at) end,
  case when job_state in ('running', 'cancel_requested') then null else job_state end, terminal_error_code
from public.recording_processing_jobs
on conflict (job_id, attempt) do nothing;

create or replace function public.processing_job_transition_allowed(p_from text, p_to text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case p_from
    when 'queued' then p_to in ('running', 'cancelled')
    when 'running' then p_to in ('succeeded', 'retry_wait', 'failed_terminal', 'cancel_requested')
    when 'retry_wait' then p_to in ('running', 'cancelled')
    when 'cancel_requested' then p_to in ('succeeded', 'failed_terminal', 'cancelled')
    else false
  end;
$$;

create or replace function public.create_recording_processing_job(
  p_operation text, p_idempotency_key text, p_input_hash text, p_recording_id uuid,
  p_doctor_id uuid, p_clinic_id uuid, p_input_version integer default 1,
  p_max_attempts integer default 3, p_scheduled_at timestamptz default now()
)
returns setof public.recording_processing_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.recording_processing_jobs%rowtype;
begin
  if p_operation not in ('transcription','summary','pdf') or p_input_version<1
     or p_max_attempts<1 or p_input_hash!~'^[a-f0-9]{64}$'
     or char_length(p_idempotency_key) not between 1 and 120 then
    raise exception 'PROCESSING_REQUEST_INVALID' using errcode='P0001';
  end if;
  if not exists (select 1 from public.recordings recording where recording.id=p_recording_id
    and recording.doctor_id=p_doctor_id and recording.clinic_id=p_clinic_id) then
    raise exception 'PROCESSING_SCOPE_INVALID' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text,0));

  select * into existing from public.recording_processing_jobs job
    where job.doctor_key=p_doctor_id and job.operation=p_operation
      and job.idempotency_key=p_idempotency_key;
  if found then
    if existing.recording_key<>p_recording_id or existing.clinic_key<>p_clinic_id
       or existing.input_hash<>p_input_hash or existing.input_version<>p_input_version then
      raise exception 'PROCESSING_IDEMPOTENCY_CONFLICT' using errcode='P0001';
    end if;
    return next existing; return;
  end if;

  select * into existing from public.recording_processing_jobs job
    where job.recording_key=p_recording_id and job.operation=p_operation
      and job.input_hash=p_input_hash;
  if found then return next existing; return; end if;
  if exists (select 1 from public.recording_processing_jobs job where job.recording_key=p_recording_id
    and job.job_state in ('queued','running','retry_wait','cancel_requested')) then
    raise exception 'PROCESSING_ACTIVE_CONFLICT' using errcode='P0001';
  end if;

  insert into public.recording_processing_jobs(recording_id,recording_key,doctor_id,doctor_key,
    clinic_id,clinic_key,operation,state,job_state,idempotency_key,input_hash,input_version,
    attempt,max_attempts,scheduled_at)
  values(p_recording_id,p_recording_id,p_doctor_id,p_doctor_id,p_clinic_id,p_clinic_id,
    p_operation,'running','queued',p_idempotency_key,p_input_hash,p_input_version,1,
    p_max_attempts,coalesce(p_scheduled_at,now())) returning * into existing;
  return next existing;
end;
$$;

create or replace function public.transition_recording_processing_job(
  p_job_id uuid, p_expected_state text, p_next_state text, p_expected_version bigint,
  p_lease_token uuid default null, p_lease_owner text default null, p_retry_at timestamptz default null,
  p_error_code text default null, p_output_reference jsonb default null
)
returns setof public.recording_processing_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  job public.recording_processing_jobs%rowtype;
  recording_value uuid;
  next_lease uuid;
  expected_artifact_status text;
begin
  select recording_key into recording_value from public.recording_processing_jobs where id = p_job_id;
  if recording_value is null then raise exception 'PROCESSING_STATE_CONFLICT' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(recording_value::text, 0));
  select * into job from public.recording_processing_jobs where id = p_job_id for update;
  if job.id is null or job.job_state <> p_expected_state or job.state_version <> p_expected_version then
    raise exception 'PROCESSING_STATE_CONFLICT' using errcode = 'P0001';
  end if;
  if not public.processing_job_transition_allowed(job.job_state, p_next_state) then
    raise exception 'PROCESSING_TRANSITION_INVALID' using errcode = 'P0001';
  end if;
  if job.job_state in ('running', 'cancel_requested') and p_next_state not in ('cancel_requested', 'cancelled')
    and (p_lease_token is null or job.lease_token is distinct from p_lease_token or job.lease_expires_at <= now()) then
    raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001';
  end if;
  if p_next_state = 'running' and ((job.job_state='retry_wait' and job.attempt>=job.max_attempts)
    or job.attempt>job.max_attempts or nullif(btrim(p_lease_owner), '') is null) then
    raise exception 'PROCESSING_ATTEMPTS_EXHAUSTED' using errcode = 'P0001';
  end if;
  if p_next_state = 'retry_wait' and (p_retry_at is null or p_retry_at <= now()) then
    raise exception 'PROCESSING_RETRY_INVALID' using errcode = 'P0001';
  end if;
  if p_next_state in ('retry_wait', 'failed_terminal') and p_error_code is null then
    raise exception 'PROCESSING_ERROR_CODE_REQUIRED' using errcode = 'P0001';
  end if;

  if p_next_state = 'succeeded' then
    expected_artifact_status := case job.operation
      when 'transcription' then 'transcribed'
      when 'summary' then 'summary_ready'
      when 'pdf' then 'pdf_saved'
    end;
    if p_output_reference is null or p_output_reference->>'recording_status'<>expected_artifact_status
      or p_output_reference-'recording_status'-'artifact_id'-'artifact_hash'<>'{}'::jsonb
      or not exists (select 1 from public.recordings recording where recording.id=job.recording_key
        and (case expected_artifact_status when 'transcribed' then recording.status in ('transcribed','summary_ready','pdf_saved')
          when 'summary_ready' then recording.status in ('summary_ready','pdf_saved')
          when 'pdf_saved' then recording.status='pdf_saved' end) for update) then
      raise exception 'PROCESSING_ARTIFACT_INCONSISTENT' using errcode = 'P0001';
    end if;
  end if;

  next_lease := case when p_next_state = 'running' then gen_random_uuid() else null end;
  update public.recording_processing_jobs set
    job_state = p_next_state,
    attempt = case when p_next_state = 'running' and job.job_state = 'retry_wait' then attempt + 1 else attempt end,
    lease_token = case when p_next_state = 'running' then next_lease
      when p_next_state = 'cancel_requested' then lease_token else null end,
    lease_expires_at = case when p_next_state = 'running' then now() + interval '5 minutes'
      when p_next_state = 'cancel_requested' then lease_expires_at else null end,
    lease_owner = case when p_next_state = 'running' then btrim(p_lease_owner)
      when p_next_state = 'cancel_requested' then lease_owner else null end,
    started_at = case when p_next_state='running' then now() else started_at end,
    heartbeat_at = case when p_next_state='running' then now() else heartbeat_at end,
    scheduled_at = case when p_next_state='retry_wait' then p_retry_at else scheduled_at end,
    next_retry_at = case when p_next_state = 'retry_wait' then p_retry_at else null end,
    terminal_error_code = case when p_next_state in ('retry_wait', 'failed_terminal') then public.processing_job_safe_error_code(p_error_code)
      when p_next_state = 'cancelled' then 'PROCESSING_CANCELLED' else null end,
    terminal_error_message = case when p_next_state in ('retry_wait', 'failed_terminal') then public.processing_job_safe_error_message(p_error_code)
      when p_next_state = 'cancelled' then public.processing_job_safe_error_message('PROCESSING_CANCELLED') else null end,
    output_reference = case when p_next_state = 'succeeded' then p_output_reference else null end,
    cancelled_at = case when p_next_state = 'cancelled' then now() else null end,
    completed_at = case when p_next_state in ('succeeded', 'failed_terminal', 'cancelled') then now() else null end,
    updated_at = now()
  where id = p_job_id;
  return query select * from public.recording_processing_jobs where id = p_job_id;
end;
$$;

create or replace function public.request_processing_job_cancellation(
  p_job_id uuid, p_doctor_id uuid, p_clinic_id uuid, p_expected_version bigint
)
returns setof public.recording_processing_jobs
language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.recording_processing_jobs%rowtype; next_state text;
begin
  select * into job from public.recording_processing_jobs where id=p_job_id
    and doctor_key=p_doctor_id and clinic_key=p_clinic_id for update;
  if job.id is null then raise exception 'PROCESSING_SCOPE_INVALID' using errcode='P0001'; end if;
  if job.state_version<>p_expected_version then
    raise exception 'PROCESSING_STATE_CONFLICT' using errcode='P0001';
  end if;
  if job.job_state='cancelled' then return next job; return;
  elsif job.job_state in ('succeeded','failed_terminal') then
    raise exception 'PROCESSING_TRANSITION_INVALID' using errcode='P0001';
  end if;
  next_state:=case when job.job_state in ('queued','retry_wait') then 'cancelled'
    when job.job_state='running' then 'cancel_requested' else job.job_state end;
  if next_state is distinct from job.job_state then
    update public.recording_processing_jobs set job_state=next_state,updated_at=now()
      where id=job.id returning * into job;
  end if;
  return next job;
end;
$$;

create or replace function public.recover_stale_processing_jobs(
  p_before timestamptz, p_retry_at timestamptz default now()+interval '30 seconds',
  p_limit integer default 100
)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.recording_processing_jobs%rowtype; recovered integer:=0;
begin
  for job in select * from public.recording_processing_jobs candidate
    where candidate.job_state in ('running','cancel_requested')
      and candidate.lease_expires_at<=p_before
    order by candidate.lease_expires_at,candidate.id for update skip locked
    limit least(1000,greatest(1,p_limit))
  loop
    update public.recording_processing_jobs set
      job_state=case when job.job_state='cancel_requested' then 'cancelled'
        when job.attempt<job.max_attempts then 'retry_wait' else 'failed_terminal' end,
      next_retry_at=case when job.job_state='running' and job.attempt<job.max_attempts
        then greatest(coalesce(p_retry_at,now()+interval '30 seconds'),now()+interval '1 second') else null end,
      terminal_error_code=case when job.job_state='cancel_requested' then 'PROCESSING_CANCELLED'
        when job.attempt<job.max_attempts then 'PROCESSING_LEASE_EXPIRED'
        else 'PROCESSING_ATTEMPTS_EXHAUSTED' end,
      updated_at=now() where id=job.id;
    recovered:=recovered+1;
  end loop;
  return recovered;
end;
$$;

create or replace function public.heartbeat_recording_processing_job(p_job_id uuid, p_lease_token uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.recording_processing_jobs set lease_expires_at = now() + interval '5 minutes',
    heartbeat_at = now(), updated_at = now()
  where id = p_job_id and state = 'running' and job_state in ('running', 'cancel_requested')
    and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.complete_recording_processing_job(p_job_id uuid, p_lease_token uuid, p_result jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.recording_processing_jobs j where j.id = p_job_id and j.state = 'completed') then
    return;
  end if;
  update public.recording_processing_jobs set state = 'completed', result = p_result,
    lease_token = null, lease_expires_at = null, error_code = null, completed_at = now(), updated_at = now()
  where id = p_job_id and state = 'running' and job_state in ('running', 'cancel_requested')
    and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.fail_recording_processing_job(p_job_id uuid, p_lease_token uuid, p_error_code text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.recording_processing_jobs set state = 'failed', error_code = left(p_error_code, 120),
    failure_count = failure_count + 1, lease_token = null, lease_expires_at = null,
    lease_owner = null, updated_at = now()
  where id = p_job_id and state = 'running' and job_state in ('running', 'cancel_requested')
    and lease_token = p_lease_token and lease_expires_at > now();
  if not found then raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001'; end if;
end;
$$;

create or replace view public.processing_job_status as
select id, doctor_key, clinic_key, operation, job_state, attempt, max_attempts, scheduled_at, started_at,
  completed_at, next_retry_at,
  job_state in ('running','cancel_requested') and lease_expires_at<=now() as is_stale,
  public.processing_job_safe_error_code(terminal_error_code) as terminal_error_code,
  public.processing_job_safe_error_message(terminal_error_code) as terminal_error_message
from public.recording_processing_jobs;

revoke all on public.processing_job_attempts, public.processing_job_events, public.processing_job_status
  from public, anon, authenticated;
grant select on public.processing_job_attempts, public.processing_job_events to service_role;
grant select on public.processing_job_status to service_role;

revoke all on function public.processing_job_safe_error_code(text),
  public.processing_job_safe_error_message(text), public.processing_job_transition_allowed(text,text),
  public.create_recording_processing_job(text,text,text,uuid,uuid,uuid,integer,integer,timestamptz),
  public.transition_recording_processing_job(uuid,text,text,bigint,uuid,text,timestamptz,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.processing_job_safe_error_code(text),
  public.processing_job_safe_error_message(text), public.processing_job_transition_allowed(text,text),
  public.create_recording_processing_job(text,text,text,uuid,uuid,uuid,integer,integer,timestamptz),
  public.transition_recording_processing_job(uuid,text,text,bigint,uuid,text,timestamptz,text,jsonb)
  to service_role;

revoke all on function public.heartbeat_recording_processing_job(uuid,uuid),
  public.request_processing_job_cancellation(uuid,uuid,uuid,bigint),
  public.recover_stale_processing_jobs(timestamptz,timestamptz,integer),
  public.complete_recording_processing_job(uuid,uuid,jsonb),
  public.fail_recording_processing_job(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.heartbeat_recording_processing_job(uuid,uuid),
  public.request_processing_job_cancellation(uuid,uuid,uuid,bigint),
  public.recover_stale_processing_jobs(timestamptz,timestamptz,integer),
  public.complete_recording_processing_job(uuid,uuid,jsonb),
  public.fail_recording_processing_job(uuid,uuid,text) to service_role;
