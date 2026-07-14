-- Issue #65: expose chunk-level manifest status for durable transcription recovery.
alter table public.transcription_chunks
  add column if not exists error_code text,
  add column if not exists error_message text;

create or replace function public.complete_transcription_chunk(
  p_job_id uuid, p_lease_token uuid, p_chunk_index integer, p_transcript text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.recording_processing_jobs j where j.id = p_job_id and j.state = 'running'
    and j.lease_token = p_lease_token and j.lease_expires_at > now()) then
    raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001';
  end if;
  update public.transcription_chunks
  set state = 'completed', transcript = p_transcript,
    error_code = null, error_message = null, updated_at = now()
  where job_id = p_job_id and chunk_index = p_chunk_index and state in ('provider_submitted', 'completed');
  if not found then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode = 'P0001'; end if;
end;
$$;

create or replace function public.fail_transcription_chunk(
  p_job_id uuid, p_lease_token uuid, p_chunk_index integer, p_error_code text, p_error_message text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.recording_processing_jobs j where j.id = p_job_id and j.state = 'running'
    and j.lease_token = p_lease_token and j.lease_expires_at > now()) then
    raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001';
  end if;
  update public.transcription_chunks
  set state = 'failed',
    error_code = left(coalesce(nullif(p_error_code, ''), 'TRANSCRIPTION_CHUNK_FAILED'), 120),
    error_message = left(coalesce(nullif(p_error_message, ''), 'Transcription chunk failed.'), 240),
    updated_at = now()
  where job_id = p_job_id and chunk_index = p_chunk_index and state in ('pending', 'provider_submitted', 'failed');
  if not found then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode = 'P0001'; end if;
end;
$$;

revoke all on function public.complete_transcription_chunk(uuid,uuid,integer,text)
  from public, anon, authenticated;
revoke all on function public.fail_transcription_chunk(uuid,uuid,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.complete_transcription_chunk(uuid,uuid,integer,text)
  to service_role;
grant execute on function public.fail_transcription_chunk(uuid,uuid,integer,text,text)
  to service_role;

-- Issue #65: server-authoritative independently uploaded transcription chunks.
create table public.transcription_sessions (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  expected_chunk_count integer not null check (expected_chunk_count between 1 and 120),
  state text not null default 'accepting' check (state in ('accepting','processing','completed','failed')),
  mime_type text,
  language text not null check (language in ('auto','en','hi','hien')),
  model text not null check (char_length(model) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 120),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (doctor_id, idempotency_key)
);
create unique index transcription_sessions_one_active_recording
  on public.transcription_sessions(recording_id) where state in ('accepting','processing');
alter table public.transcription_sessions enable row level security;

alter table public.transcription_chunks
  alter column job_id drop not null,
  add column if not exists session_id uuid references public.transcription_sessions(id) on delete restrict,
  add column if not exists mime_type text,
  add column if not exists error_code text,
  add column if not exists error_message text;
alter table public.transcription_chunks drop constraint if exists transcription_chunk_recording_index_unique;
alter table public.transcription_chunks drop constraint if exists transcription_chunks_expected_count_check;
alter table public.transcription_chunks add constraint transcription_chunks_expected_count_check
  check (expected_count between 1 and 120) not valid;
alter table public.transcription_chunks drop constraint if exists transcription_chunks_state_check;
alter table public.transcription_chunks add constraint transcription_chunks_state_check
  check (state in ('pending','receiving','stored','provider_submitted','completed','failed')) not valid;
alter table public.transcription_chunks add constraint transcription_chunk_parent_check
  check ((job_id is null) <> (session_id is null)) not valid;
create unique index transcription_chunk_session_index_unique
  on public.transcription_chunks(session_id,chunk_index) where session_id is not null;

alter table public.processing_artifacts
  add column if not exists session_id uuid references public.transcription_sessions(id) on delete restrict;

create or replace function public.create_transcription_session(
  p_recording_id uuid, p_doctor_id uuid, p_clinic_id uuid, p_expected_chunk_count integer,
  p_language text, p_model text, p_idempotency_key text
) returns table (
  disposition text, id uuid, recording_id uuid, doctor_id uuid, clinic_id uuid,
  expected_chunk_count integer, state text, mime_type text, language text, model text, idempotency_key text, created_at timestamptz
) language plpgsql security definer set search_path = public, pg_temp as $$
declare target public.recordings%rowtype; existing public.transcription_sessions%rowtype;
begin
  if p_expected_chunk_count not between 1 and 120 or p_language not in ('auto','en','hi','hien')
     or nullif(p_model,'') is null or char_length(p_model) > 120
     or nullif(p_idempotency_key,'') is null or char_length(p_idempotency_key) > 120 then
    raise exception 'TRANSCRIPTION_SESSION_INVALID' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text,0));
  select * into target from public.recordings r where r.id=p_recording_id;
  if target.id is null or target.doctor_id<>p_doctor_id or target.clinic_id<>p_clinic_id then
    raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode='P0001';
  end if;
  select * into existing from public.transcription_sessions s
    where s.doctor_id=p_doctor_id and s.idempotency_key=p_idempotency_key;
  if existing.id is not null then
    if existing.recording_id<>p_recording_id or existing.clinic_id<>p_clinic_id
       or existing.expected_chunk_count<>p_expected_chunk_count or existing.language<>p_language or existing.model<>p_model then
      raise exception 'TRANSCRIPTION_SESSION_IMMUTABLE' using errcode='P0001';
    end if;
    return query select 'existing',existing.id,existing.recording_id,existing.doctor_id,existing.clinic_id,
      existing.expected_chunk_count,existing.state,existing.mime_type,existing.language,existing.model,existing.idempotency_key,existing.created_at;
    return;
  end if;
  if target.status<>'recorded' or target.duration_seconds<=0 or target.duration_seconds>3600 then
    raise exception 'PROCESSING_RECORDING_STATE_INVALID' using errcode='P0001';
  end if;
  if exists(select 1 from public.transcription_sessions s where s.recording_id=p_recording_id
    and s.state in ('accepting','processing')) then
    raise exception 'TRANSCRIPTION_SESSION_ACTIVE' using errcode='P0001';
  end if;
  insert into public.transcription_sessions(recording_id,doctor_id,clinic_id,expected_chunk_count,language,model,idempotency_key)
    values(p_recording_id,p_doctor_id,p_clinic_id,p_expected_chunk_count,p_language,p_model,p_idempotency_key)
    returning * into existing;
  return query select 'created',existing.id,existing.recording_id,existing.doctor_id,existing.clinic_id,
    existing.expected_chunk_count,existing.state,existing.mime_type,existing.language,existing.model,existing.idempotency_key,existing.created_at;
end $$;

create or replace function public.claim_transcription_session_chunk(
  p_session_id uuid,p_doctor_id uuid,p_clinic_id uuid,p_chunk_index integer,p_expected_count integer,
  p_byte_size integer,p_duration_seconds numeric,p_mime_type text,p_checksum text,p_storage_path text
) returns table (
  disposition text,chunk_index integer,expected_count integer,byte_size integer,duration_seconds numeric,
  mime_type text,checksum text,storage_path text,state text,transcript text,error_code text,error_message text
) language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.transcription_sessions%rowtype; c public.transcription_chunks%rowtype; recording public.recordings%rowtype;
  total_bytes bigint; total_seconds numeric; chunk_count integer; expected_prefix text;
begin
  select * into s from public.transcription_sessions x where x.id=p_session_id for update;
  if s.id is null or s.doctor_id<>p_doctor_id or s.clinic_id<>p_clinic_id then
    raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode='P0001';
  end if;
  expected_prefix:=s.clinic_id||'/'||s.doctor_id||'/'||s.recording_id||'/sessions/'||s.id||'/chunks/'||lpad(p_chunk_index::text,4,'0')||'-';
  if p_expected_count<>s.expected_chunk_count
     or p_chunk_index<0 or p_chunk_index>=p_expected_count or p_byte_size<=0 or p_byte_size>26214400
     or p_duration_seconds<=0 or p_duration_seconds>3600
     or p_mime_type not in ('audio/webm','audio/ogg','audio/mp4','audio/m4a','audio/aac','audio/wav','audio/x-wav')
     or p_checksum!~'^[a-f0-9]{64}$' or p_storage_path not like expected_prefix||p_checksum||'.%' then
    raise exception 'TRANSCRIPTION_CHUNK_INVALID' using errcode='P0001';
  end if;
  select * into c from public.transcription_chunks x where x.session_id=p_session_id and x.chunk_index=p_chunk_index;
  if c.id is not null then
    if c.expected_count<>p_expected_count or c.byte_size<>p_byte_size or abs(c.duration_seconds-p_duration_seconds)>.001
       or c.mime_type<>p_mime_type or c.checksum<>p_checksum or c.storage_path<>p_storage_path then
      raise exception 'TRANSCRIPTION_CHUNK_IMMUTABLE' using errcode='P0001';
    end if;
    return query select 'existing',c.chunk_index,c.expected_count,c.byte_size,c.duration_seconds,c.mime_type,c.checksum,
      c.storage_path,c.state,c.transcript,c.error_code,c.error_message; return;
  end if;
  if s.state not in ('accepting','processing') then
    raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode='P0001';
  end if;
  if s.mime_type is not null and s.mime_type<>p_mime_type then
    raise exception 'TRANSCRIPTION_CHUNK_IMMUTABLE' using errcode='P0001';
  end if;
  select * into recording from public.recordings r where r.id=s.recording_id;
  select coalesce(sum(x.byte_size),0),coalesce(sum(x.duration_seconds),0),count(*) into total_bytes,total_seconds,chunk_count
    from public.transcription_chunks x where x.session_id=p_session_id;
  if total_bytes+p_byte_size>209715200 or total_seconds+p_duration_seconds>recording.duration_seconds+1
     or (chunk_count+1=s.expected_chunk_count and abs(total_seconds+p_duration_seconds-recording.duration_seconds)>1) then
    raise exception 'TRANSCRIPTION_CHUNK_LIMIT_EXCEEDED' using errcode='P0001';
  end if;
  update public.transcription_sessions target_session
    set mime_type=coalesce(target_session.mime_type,p_mime_type),updated_at=now()
    where target_session.id=p_session_id;
  insert into public.transcription_chunks(session_id,recording_key,chunk_index,expected_count,byte_size,duration_seconds,
    mime_type,checksum,storage_path,state) values(p_session_id,s.recording_id,p_chunk_index,p_expected_count,p_byte_size,
    p_duration_seconds,p_mime_type,p_checksum,p_storage_path,'receiving') returning * into c;
  insert into public.processing_artifacts(session_id,recording_key,kind,storage_path,byte_size,checksum,state)
    values(p_session_id,s.recording_id,'audio',p_storage_path,p_byte_size,p_checksum,'pending');
  return query select 'accepted',c.chunk_index,c.expected_count,c.byte_size,c.duration_seconds,c.mime_type,c.checksum,
    c.storage_path,c.state,c.transcript,c.error_code,c.error_message;
end $$;

create or replace function public.mark_transcription_session_chunk_stored(p_session_id uuid,p_chunk_index integer,p_checksum text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare path text;
begin
  update public.transcription_chunks set state='stored',updated_at=now() where session_id=p_session_id
    and chunk_index=p_chunk_index and checksum=p_checksum and state='receiving' returning storage_path into path;
  if path is null then select storage_path into path from public.transcription_chunks where session_id=p_session_id
    and chunk_index=p_chunk_index and checksum=p_checksum and state in ('stored','provider_submitted','completed'); end if;
  if path is null then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode='P0001'; end if;
  update public.processing_artifacts set state='current' where session_id=p_session_id and storage_path=path and state='pending';
end $$;

create or replace function public.submit_transcription_session_chunk(p_session_id uuid,p_chunk_index integer,p_provider_request_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.transcription_chunks set state='provider_submitted',provider_request_key=p_provider_request_key,updated_at=now()
    where session_id=p_session_id and chunk_index=p_chunk_index and state='stored';
  return found;
end $$;

create or replace function public.complete_transcription_session_chunk(p_session_id uuid,p_chunk_index integer,p_transcript text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.transcription_chunks set state='completed',transcript=p_transcript,error_code=null,error_message=null,updated_at=now()
    where session_id=p_session_id and chunk_index=p_chunk_index and state='provider_submitted';
  if not found then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode='P0001'; end if;
  update public.transcription_sessions s set state=case when
    (select count(*) from public.transcription_chunks c where c.session_id=s.id and c.state='completed')=s.expected_chunk_count
    then 'completed' else case when (select count(*) from public.transcription_chunks c where c.session_id=s.id)=s.expected_chunk_count
      then 'processing' else 'accepting' end end,
    completed_at=case when (select count(*) from public.transcription_chunks c where c.session_id=s.id and c.state='completed')=s.expected_chunk_count then now() else null end,
    updated_at=now() where s.id=p_session_id;
end $$;

create or replace function public.fail_transcription_session_chunk(p_session_id uuid,p_chunk_index integer,p_error_code text,p_error_message text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.transcription_chunks set state='failed',error_code=left(coalesce(nullif(p_error_code,''),'TRANSCRIPTION_CHUNK_FAILED'),120),
    error_message=left(coalesce(nullif(p_error_message,''),'Transcription chunk failed.'),240),updated_at=now()
    where session_id=p_session_id and chunk_index=p_chunk_index and state='provider_submitted';
  if not found then raise exception 'TRANSCRIPTION_CHUNK_STATE_INVALID' using errcode='P0001'; end if;
  update public.transcription_sessions set state='failed',updated_at=now() where id=p_session_id;
end $$;

create or replace function public.expire_transcription_sessions(p_receipt_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare expired integer;
begin
  perform 1 from public.transcription_sessions s where s.updated_at<now()-interval '90 days' for update;
  insert into public.deletion_object_queue(receipt_id,bucket,storage_path)
    select distinct p_receipt_id,'audio',refs.storage_path from (
      select c.storage_path from public.transcription_chunks c join public.transcription_sessions s on s.id=c.session_id
        where s.updated_at<now()-interval '90 days'
      union all
      select a.storage_path from public.processing_artifacts a join public.transcription_sessions s on s.id=a.session_id
        where s.updated_at<now()-interval '90 days' and a.state<>'deleted'
    ) refs where refs.storage_path is not null and refs.storage_path<>''
    on conflict(receipt_id,bucket,storage_path) do nothing;
  delete from public.processing_artifacts a using public.transcription_sessions s
    where a.session_id=s.id and s.updated_at<now()-interval '90 days';
  delete from public.transcription_chunks c using public.transcription_sessions s
    where c.session_id=s.id and s.updated_at<now()-interval '90 days';
  delete from public.transcription_sessions where updated_at<now()-interval '90 days';
  get diagnostics expired=row_count;
  return expired;
end $$;

create or replace function public.reconcile_retention_and_orphans()
returns jsonb language plpgsql security definer set search_path=public,storage,pg_temp as $$
declare v_receipt_id uuid; queued integer; logs_deleted integer; attempts_deleted integer; sessions_expired integer;
begin
  update public.recording_processing_jobs set state='failed',error_code='PROCESSING_LEASE_EXPIRED',
    failure_count=failure_count+1,lease_token=null,lease_expires_at=null,updated_at=now()
  where state='running' and lease_expires_at<=now();
  delete from public.diagnostic_logs where created_at<now()-interval '30 days';
  get diagnostics logs_deleted=row_count;
  delete from public.transcription_attempts where created_at<now()-interval '30 days';
  get diagnostics attempts_deleted=row_count;
  insert into public.deletion_receipts(request_type,subject_hash,actor_hash)
    values('retention',encode(extensions.digest('retention:'||clock_timestamp()::text,'sha256'),'hex'),
      encode(extensions.digest('system-retention','sha256'),'hex')) returning id into v_receipt_id;
  insert into public.deletion_object_queue(receipt_id,bucket,storage_path)
    select v_receipt_id,o.bucket_id,o.name from storage.objects o
    where o.bucket_id in ('audio','pdfs') and o.created_at<now()-interval '1 day'
      and not exists(select 1 from public.recordings r where
        (o.bucket_id='audio' and r.audio_storage_path=o.name) or (o.bucket_id='pdfs' and r.pdf_storage_path=o.name))
      and (o.bucket_id<>'audio' or not exists(select 1 from public.transcription_attempts t where t.audio_storage_path=o.name))
      and (o.bucket_id<>'audio' or not exists(select 1 from public.transcription_chunks c where c.storage_path=o.name))
      and not exists(select 1 from public.processing_artifacts a where a.storage_path=o.name and a.state<>'deleted'
        and ((o.bucket_id='audio' and a.kind='audio') or (o.bucket_id='pdfs' and a.kind='pdf')))
      and not exists(select 1 from public.deletion_object_queue q where q.bucket=o.bucket_id and q.storage_path=o.name)
    on conflict do nothing;
  sessions_expired:=public.expire_transcription_sessions(v_receipt_id);
  select count(*) into queued from public.deletion_object_queue where receipt_id=v_receipt_id;
  update public.deletion_receipts set object_count=queued,state=case when queued=0 then 'completed' else 'queued' end,
    completed_at=case when queued=0 then now() else null end where id=v_receipt_id;
  delete from public.processing_artifacts a where a.state='deleted' and a.deleted_at<now()-interval '90 days';
  update public.processing_artifacts set job_id=null where job_id in (
    select id from public.recording_processing_jobs where state<>'running'
      and coalesce(completed_at,updated_at,created_at)<now()-interval '90 days');
  delete from public.transcription_chunks where job_id in (
    select id from public.recording_processing_jobs where state<>'running'
      and coalesce(completed_at,updated_at,created_at)<now()-interval '90 days');
  delete from public.processing_usage_reservations where job_id in (
    select id from public.recording_processing_jobs where state<>'running'
      and coalesce(completed_at,updated_at,created_at)<now()-interval '90 days');
  delete from public.recording_processing_jobs where state<>'running'
    and coalesce(completed_at,updated_at,created_at)<now()-interval '90 days';
  delete from public.deletion_receipts where expires_at<now() and state='completed';
  return jsonb_build_object('receipt_id',v_receipt_id,'orphan_objects_queued',queued,
    'diagnostic_logs_deleted',logs_deleted,'transcription_attempts_deleted',attempts_deleted,
    'transcription_sessions_expired',sessions_expired);
end $$;

revoke all on table public.transcription_sessions from public,anon,authenticated;
revoke all on function public.create_transcription_session(uuid,uuid,uuid,integer,text,text,text),
  public.claim_transcription_session_chunk(uuid,uuid,uuid,integer,integer,integer,numeric,text,text,text),
  public.mark_transcription_session_chunk_stored(uuid,integer,text),public.submit_transcription_session_chunk(uuid,integer,text),
  public.complete_transcription_session_chunk(uuid,integer,text),public.fail_transcription_session_chunk(uuid,integer,text,text),
  public.expire_transcription_sessions(uuid)
  from public,anon,authenticated;
grant select on public.transcription_sessions,public.transcription_chunks to service_role;
grant execute on function public.create_transcription_session(uuid,uuid,uuid,integer,text,text,text),
  public.claim_transcription_session_chunk(uuid,uuid,uuid,integer,integer,integer,numeric,text,text,text),
  public.mark_transcription_session_chunk_stored(uuid,integer,text),public.submit_transcription_session_chunk(uuid,integer,text),
  public.complete_transcription_session_chunk(uuid,integer,text),public.fail_transcription_session_chunk(uuid,integer,text,text)
  to service_role;
