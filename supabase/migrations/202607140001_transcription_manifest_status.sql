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
