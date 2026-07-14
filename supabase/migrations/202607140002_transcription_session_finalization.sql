-- Issue #66: server-authoritative session finalization and immutable AI provenance.
alter table public.recordings add column if not exists ai_provenance jsonb;
alter table public.recordings add constraint recordings_ai_provenance_object_check
  check (ai_provenance is null or jsonb_typeof(ai_provenance)='object');

alter table public.transcription_sessions
  add column if not exists generation integer not null default 1 check (generation>0),
  add column if not exists finalization_idempotency_key text,
  add column if not exists transcript_hash text,
  add column if not exists ai_provenance jsonb,
  add column if not exists finalized_at timestamptz;
alter table public.transcription_sessions add constraint transcription_sessions_finalization_check check (
  (finalized_at is null and finalization_idempotency_key is null and transcript_hash is null and ai_provenance is null)
  or (finalized_at is not null and finalization_idempotency_key is not null
    and char_length(finalization_idempotency_key) between 1 and 120
    and transcript_hash~'^[a-f0-9]{64}$' and jsonb_typeof(ai_provenance)='object')
);
create unique index transcription_session_finalization_key_unique
  on public.transcription_sessions(doctor_id,finalization_idempotency_key)
  where finalization_idempotency_key is not null;

create or replace function public.create_transcription_session(
  p_recording_id uuid,p_doctor_id uuid,p_clinic_id uuid,p_expected_chunk_count integer,
  p_language text,p_model text,p_idempotency_key text
) returns table (
  disposition text,id uuid,recording_id uuid,doctor_id uuid,clinic_id uuid,
  expected_chunk_count integer,state text,mime_type text,language text,model text,idempotency_key text,created_at timestamptz
) language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.recordings%rowtype; existing public.transcription_sessions%rowtype;
begin
  if p_expected_chunk_count not between 1 and 120 or p_language not in ('auto','en','hi','hien')
     or nullif(p_model,'') is null or char_length(p_model)>120
     or nullif(p_idempotency_key,'') is null or char_length(p_idempotency_key)>120 then
    raise exception 'TRANSCRIPTION_SESSION_INVALID' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_recording_id::text,0));
  select * into target from public.recordings as recording where recording.id=p_recording_id;
  if target.id is null or target.doctor_id<>p_doctor_id or target.clinic_id<>p_clinic_id then
    raise exception 'PROCESSING_RECORDING_SCOPE_INVALID' using errcode='P0001';
  end if;
  select * into existing from public.transcription_sessions as session
    where session.doctor_id=p_doctor_id and session.idempotency_key=p_idempotency_key;
  if existing.id is not null then
    if existing.recording_id<>p_recording_id or existing.clinic_id<>p_clinic_id
       or existing.expected_chunk_count<>p_expected_chunk_count or existing.language<>p_language or existing.model<>p_model then
      raise exception 'TRANSCRIPTION_SESSION_IMMUTABLE' using errcode='P0001';
    end if;
    return query select 'existing',existing.id,existing.recording_id,existing.doctor_id,existing.clinic_id,
      existing.expected_chunk_count,existing.state,existing.mime_type,existing.language,existing.model,
      existing.idempotency_key,existing.created_at;
    return;
  end if;
  if target.status<>'recorded' or target.duration_seconds<=0 or target.duration_seconds>3600 then
    raise exception 'PROCESSING_RECORDING_STATE_INVALID' using errcode='P0001';
  end if;
  if exists(select 1 from public.transcription_sessions as session where session.recording_id=p_recording_id
    and (session.state in ('accepting','processing') or (session.state='completed' and session.finalized_at is null))) then
    raise exception 'TRANSCRIPTION_SESSION_ACTIVE' using errcode='P0001';
  end if;
  insert into public.transcription_sessions(recording_id,doctor_id,clinic_id,expected_chunk_count,language,model,idempotency_key)
    values(p_recording_id,p_doctor_id,p_clinic_id,p_expected_chunk_count,p_language,p_model,p_idempotency_key)
    returning * into existing;
  return query select 'created',existing.id,existing.recording_id,existing.doctor_id,existing.clinic_id,
    existing.expected_chunk_count,existing.state,existing.mime_type,existing.language,existing.model,
    existing.idempotency_key,existing.created_at;
end $$;

create or replace function public.prevent_ai_provenance_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.ai_provenance is not null and new.ai_provenance is distinct from old.ai_provenance then
    raise exception 'TRANSCRIPTION_FINALIZATION_IMMUTABLE' using errcode='P0001';
  end if;
  return new;
end $$;
drop trigger if exists recordings_ai_provenance_immutable on public.recordings;
create trigger recordings_ai_provenance_immutable before update of ai_provenance on public.recordings
  for each row execute function public.prevent_ai_provenance_mutation();

create or replace function public.finalize_transcription_session(
  p_session_id uuid,p_doctor_id uuid,p_clinic_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  session_recording_id uuid;
  session_row public.transcription_sessions%rowtype;
  recording_row public.recordings%rowtype;
  v_chunk_count integer; v_total_bytes bigint; v_total_duration numeric;
  v_transcript text; v_transcript_hash text; v_provenance jsonb; v_finalized_at timestamptz:=clock_timestamp();
begin
  if nullif(p_idempotency_key,'') is null or char_length(p_idempotency_key)>120
     or p_idempotency_key!~'^[A-Za-z0-9._:-]+$' then
    raise exception 'TRANSCRIPTION_SESSION_INVALID' using errcode='P0001';
  end if;
  select session.recording_id into session_recording_id from public.transcription_sessions as session
    where session.id=p_session_id and session.doctor_id=p_doctor_id and session.clinic_id=p_clinic_id;
  if session_recording_id is null then
    raise exception 'TRANSCRIPTION_SESSION_NOT_FOUND' using errcode='P0001';
  end if;
  -- Match create/delete lock order: recording advisory lock before any session row lock.
  perform pg_advisory_xact_lock(hashtextextended(session_recording_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('transcription-finalize-key:'||p_doctor_id||':'||p_idempotency_key,0));
  select * into session_row from public.transcription_sessions as session
    where session.id=p_session_id for update;
  if session_row.id is null or session_row.recording_id<>session_recording_id
     or session_row.doctor_id<>p_doctor_id or session_row.clinic_id<>p_clinic_id then
    raise exception 'TRANSCRIPTION_SESSION_NOT_FOUND' using errcode='P0001';
  end if;
  select * into recording_row from public.recordings as recording
    where recording.id=session_row.recording_id for update;
  if recording_row.id is null or recording_row.doctor_id<>p_doctor_id or recording_row.clinic_id<>p_clinic_id then
    raise exception 'TRANSCRIPTION_SESSION_NOT_FOUND' using errcode='P0001';
  end if;

  if session_row.finalization_idempotency_key is not null then
    if session_row.finalization_idempotency_key<>p_idempotency_key
       or recording_row.ai_provenance is null
       or recording_row.ai_provenance->>'session_id'<>session_row.id::text then
      raise exception 'TRANSCRIPTION_FINALIZATION_IMMUTABLE' using errcode='P0001';
    end if;
    return jsonb_build_object('recording_id',session_row.recording_id,'session_id',session_row.id,
      'status','transcribed','transcript_hash',session_row.transcript_hash,'generation',session_row.generation,
      'finalized_at',session_row.finalized_at);
  end if;
  if exists(select 1 from public.transcription_sessions as reused where reused.doctor_id=p_doctor_id
    and reused.finalization_idempotency_key=p_idempotency_key and reused.id<>session_row.id) then
    raise exception 'TRANSCRIPTION_FINALIZATION_KEY_REUSED' using errcode='P0001';
  end if;
  if session_row.state<>'completed' or recording_row.status<>'recorded'
     or recording_row.ai_provenance is not null then
    raise exception 'TRANSCRIPTION_SESSION_NOT_FINALIZABLE' using errcode='P0001';
  end if;

  select count(*),coalesce(sum(chunk.byte_size),0),coalesce(sum(chunk.duration_seconds),0)
    into v_chunk_count,v_total_bytes,v_total_duration
    from public.transcription_chunks as chunk where chunk.session_id=session_row.id;
  if v_chunk_count<>session_row.expected_chunk_count or v_total_bytes<=0 or v_total_bytes>209715200
     or recording_row.duration_seconds is null or abs(v_total_duration-recording_row.duration_seconds)>1
     or exists(select 1 from generate_series(0,session_row.expected_chunk_count-1) as expected(chunk_index)
       left join public.transcription_chunks as chunk on chunk.session_id=session_row.id
        and chunk.chunk_index=expected.chunk_index where chunk.id is null)
     or exists(select 1 from public.transcription_chunks as chunk where chunk.session_id=session_row.id
       and (chunk.recording_key<>session_row.recording_id
         or chunk.expected_count<>session_row.expected_chunk_count or chunk.state<>'completed'
         or nullif(btrim(chunk.transcript),'') is null))
     or (select count(distinct chunk.storage_path) from public.transcription_chunks as chunk
       where chunk.session_id=session_row.id)<>session_row.expected_chunk_count then
    raise exception 'TRANSCRIPTION_SESSION_NOT_FINALIZABLE' using errcode='P0001';
  end if;
  if exists(select 1 from public.transcription_chunks as chunk where chunk.session_id=session_row.id
    and not exists(select 1 from public.processing_artifacts as artifact where artifact.session_id=session_row.id
      and artifact.recording_key=session_row.recording_id and artifact.kind='audio' and artifact.state='current'
      and artifact.storage_path=chunk.storage_path and artifact.checksum=chunk.checksum
      and artifact.byte_size=chunk.byte_size)) then
    raise exception 'TRANSCRIPTION_FINALIZATION_ARTIFACT_INVALID' using errcode='P0001';
  end if;

  select string_agg(chunk.transcript,E'\n\n' order by chunk.chunk_index) into v_transcript
    from public.transcription_chunks as chunk where chunk.session_id=session_row.id;
  v_transcript_hash:=encode(extensions.digest(convert_to(v_transcript,'UTF8'),'sha256'),'hex');
  select jsonb_build_object(
    'schema_version',1,'provider','openai','model',session_row.model,'model_version',session_row.model,
    'language',session_row.language,'hints',jsonb_build_array(),'session_id',session_row.id,
    'generation',session_row.generation,'chunk_count',session_row.expected_chunk_count,
    'chunk_hashes',jsonb_agg(jsonb_build_object('chunk_id',chunk.id,'index',chunk.chunk_index,
      'audio_sha256',chunk.checksum,'transcript_sha256',
      encode(extensions.digest(convert_to(chunk.transcript,'UTF8'),'sha256'),'hex')) order by chunk.chunk_index),
    'provider_request_hashes',coalesce(jsonb_agg(jsonb_build_object('index',chunk.chunk_index,'request_sha256',
      encode(extensions.digest(convert_to(chunk.provider_request_key,'UTF8'),'sha256'),'hex')) order by chunk.chunk_index)
      filter(where chunk.provider_request_key is not null),'[]'::jsonb),
    'transcript_hash',v_transcript_hash,'finalized_at',v_finalized_at
  ) into v_provenance from public.transcription_chunks as chunk where chunk.session_id=session_row.id;

  if recording_row.audio_storage_path is not null then
    if exists(select 1 from public.processing_artifacts as artifact
      where artifact.storage_path=recording_row.audio_storage_path
        and (artifact.recording_key<>session_row.recording_id or artifact.kind<>'audio')) then
      raise exception 'PROCESSING_ARTIFACT_CONFLICT' using errcode='P0001';
    end if;
    if not exists(select 1 from public.processing_artifacts as artifact
      where artifact.storage_path=recording_row.audio_storage_path and artifact.session_id=session_row.id) then
      insert into public.processing_artifacts(recording_key,kind,storage_path,state,origin)
        values(session_row.recording_id,'audio',recording_row.audio_storage_path,'superseded','legacy')
        on conflict(storage_path) do update set state=case
          when public.processing_artifacts.state in ('deleting','deleted') then public.processing_artifacts.state
          else 'superseded' end;
    end if;
  end if;

  update public.recordings as recording set transcript=v_transcript,summary=null,pdf_storage_path=null,
    pdf_generated_at=null,pdf_version=null,audio_storage_path=null,status='transcribed',ai_provenance=v_provenance
    where recording.id=session_row.recording_id and recording.status='recorded'
      and recording.ai_provenance is null;
  if not found then raise exception 'RECORDING_NOT_TRANSCRIBABLE' using errcode='P0001'; end if;
  update public.transcription_sessions as session set finalization_idempotency_key=p_idempotency_key,
    transcript_hash=v_transcript_hash,ai_provenance=v_provenance,finalized_at=v_finalized_at,updated_at=v_finalized_at
    where session.id=session_row.id and session.finalized_at is null;
  if not found then raise exception 'TRANSCRIPTION_FINALIZATION_IMMUTABLE' using errcode='P0001'; end if;
  return jsonb_build_object('recording_id',session_row.recording_id,'session_id',session_row.id,
    'status','transcribed','transcript_hash',v_transcript_hash,'generation',session_row.generation,
    'finalized_at',v_finalized_at);
end $$;

revoke all on function public.prevent_ai_provenance_mutation(),
  public.finalize_transcription_session(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalize_transcription_session(uuid,uuid,uuid,text) to service_role;
