-- Replace the production function without the PL/pgSQL `item`/SQL alias collision (42702).
create or replace function public.save_transcription_chunk_manifest(
  p_job_id uuid,
  p_lease_token uuid,
  p_recording_id uuid,
  p_chunks jsonb
)
returns setof public.transcription_chunks
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  locked_job public.recording_processing_jobs%rowtype;
  manifest_element jsonb;
  manifest_count integer;
  existing_count integer;
  matched_count integer;
  expected_index integer := 0;
  total_bytes bigint := 0;
  total_seconds numeric := 0;
begin
  if p_chunks is null or jsonb_typeof(p_chunks) <> 'array' then
    raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
  end if;
  manifest_count := jsonb_array_length(p_chunks);
  select jobs.* into locked_job
  from public.recording_processing_jobs as jobs
  where jobs.id = p_job_id
  for update;
  if locked_job.id is null or locked_job.operation <> 'transcription'
     or locked_job.recording_key <> p_recording_id or locked_job.state <> 'running'
     or locked_job.lease_token <> p_lease_token or locked_job.lease_expires_at <= now() then
    raise exception 'PROCESSING_LEASE_LOST' using errcode = 'P0001';
  end if;
  if manifest_count not between 1 and 8 then
    raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
  end if;

  for manifest_element in
    select elements.element
    from jsonb_array_elements(p_chunks) as elements(element)
  loop
    if (manifest_element->>'index')::integer <> expected_index
       or (manifest_element->>'count')::integer <> manifest_count
       or (manifest_element->>'bytes')::integer <= 0
       or (manifest_element->>'durationSeconds')::numeric < 0
       or (manifest_element->>'checksum') !~ '^[a-f0-9]{64}$'
       or nullif(manifest_element->>'storagePath', '') is null then
      raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
    end if;
    total_bytes := total_bytes + (manifest_element->>'bytes')::integer;
    total_seconds := total_seconds + (manifest_element->>'durationSeconds')::numeric;
    expected_index := expected_index + 1;
  end loop;
  if total_bytes <> locked_job.storage_bytes
     or abs(total_seconds - locked_job.transcription_seconds) > 0.01 then
    raise exception 'TRANSCRIPTION_MANIFEST_INVALID' using errcode = 'P0001';
  end if;

  select count(*) into existing_count
  from public.transcription_chunks as chunks
  where chunks.job_id = p_job_id;
  if existing_count > 0 then
    select count(*) into matched_count
    from public.transcription_chunks as chunks
    join lateral jsonb_array_elements(p_chunks) as manifest_entries(entry)
      on (manifest_entries.entry->>'index')::integer = chunks.chunk_index
    where chunks.job_id = p_job_id
      and chunks.expected_count = (manifest_entries.entry->>'count')::integer
      and chunks.byte_size = (manifest_entries.entry->>'bytes')::integer
      and abs(chunks.duration_seconds - (manifest_entries.entry->>'durationSeconds')::numeric) <= 0.001
      and chunks.checksum = manifest_entries.entry->>'checksum'
      and chunks.storage_path = manifest_entries.entry->>'storagePath';
    if existing_count <> manifest_count or matched_count <> manifest_count then
      raise exception 'TRANSCRIPTION_MANIFEST_IMMUTABLE' using errcode = 'P0001';
    end if;
  else
    insert into public.transcription_chunks (
      job_id, recording_key, chunk_index, expected_count, byte_size,
      duration_seconds, checksum, storage_path
    )
    select p_job_id, p_recording_id,
      (manifest_entries.entry->>'index')::integer,
      (manifest_entries.entry->>'count')::integer,
      (manifest_entries.entry->>'bytes')::integer,
      (manifest_entries.entry->>'durationSeconds')::numeric,
      manifest_entries.entry->>'checksum', manifest_entries.entry->>'storagePath'
    from jsonb_array_elements(p_chunks) as manifest_entries(entry);
  end if;
  return query
    select chunks.*
    from public.transcription_chunks as chunks
    where chunks.job_id = p_job_id
    order by chunks.chunk_index;
end;
$$;

revoke all on function public.save_transcription_chunk_manifest(uuid,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_transcription_chunk_manifest(uuid,uuid,uuid,jsonb)
  to service_role;
