\set ON_ERROR_STOP on
begin;

insert into public.clinics(id,name,clinic_code) values
  ('f6800000-0000-4000-8000-000000000001','Queue A','QUEU68'),
  ('f6800000-0000-4000-8000-000000000002','Queue B','QUEUEB');
insert into public.doctors(id,firebase_uid,clinic_id,role,account_status,name,specialization,phone) values
  ('f6800000-0000-4000-8000-000000000011','queue-doctor-a','f6800000-0000-4000-8000-000000000001','owner','active','Doctor A','Medicine','+910000000068'),
  ('f6800000-0000-4000-8000-000000000012','queue-doctor-b','f6800000-0000-4000-8000-000000000002','owner','active','Doctor B','Medicine','+910000000069');
insert into public.recordings(id,doctor_id,clinic_id,patient_id,duration_seconds,transcript,summary,status,recorded_at)
select id::uuid,doctor_id::uuid,clinic_id::uuid,'P-68',10,transcript,summary,status,now()
from (values
  ('f6800000-0000-4000-8000-000000000101','f6800000-0000-4000-8000-000000000011','f6800000-0000-4000-8000-000000000001',null,null,'recorded'),
  ('f6800000-0000-4000-8000-000000000102','f6800000-0000-4000-8000-000000000011','f6800000-0000-4000-8000-000000000001','Transcript',null,'transcribed'),
  ('f6800000-0000-4000-8000-000000000103','f6800000-0000-4000-8000-000000000012','f6800000-0000-4000-8000-000000000002','Transcript',null,'transcribed'),
  ('f6800000-0000-4000-8000-000000000104','f6800000-0000-4000-8000-000000000011','f6800000-0000-4000-8000-000000000001',null,null,'recorded'),
  ('f6800000-0000-4000-8000-000000000105','f6800000-0000-4000-8000-000000000011','f6800000-0000-4000-8000-000000000001',null,null,'recorded'),
  ('f6800000-0000-4000-8000-000000000106','f6800000-0000-4000-8000-000000000011','f6800000-0000-4000-8000-000000000001',null,null,'recorded'),
  ('f6800000-0000-4000-8000-000000000107','f6800000-0000-4000-8000-000000000012','f6800000-0000-4000-8000-000000000002','Transcript','Summary','summary_ready'),
  ('f6800000-0000-4000-8000-000000000108','f6800000-0000-4000-8000-000000000012','f6800000-0000-4000-8000-000000000002','Transcript','Summary','summary_ready')
) fixture(id,doctor_id,clinic_id,transcript,summary,status);

do $$
declare job record; replay record; claimed record; recovered integer; blocked boolean;
begin
  select * into job from public.enqueue_recording_processing_job('summary','summary-v1',repeat('a',64),
    'f6800000-0000-4000-8000-000000000102','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,0,0,null);
  select * into replay from public.enqueue_recording_processing_job('summary','summary-v1',repeat('a',64),
    'f6800000-0000-4000-8000-000000000102','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,0,0,null);
  if job.id<>replay.id or job.input_version<>1 then raise exception 'duplicate enqueue was not canonical'; end if;
  perform public.request_processing_job_cancellation(job.id,job.doctor_key,job.clinic_key,job.state_version);
  select * into replay from public.enqueue_recording_processing_job('summary','summary-v2',repeat('a',64),
    job.recording_key,job.doctor_key,job.clinic_key,2,0,0,null);
  if replay.id=job.id or replay.input_version<>2 then raise exception 'input version identity collapsed'; end if;
  update public.recording_processing_jobs set scheduled_at=now()+interval '1 day' where id=replay.id;

  select * into job from public.enqueue_recording_processing_job('transcription','audio-1',repeat('b',64),
    'f6800000-0000-4000-8000-000000000101','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,10,100,'queue/audio-1.webm');
  if exists(select 1 from public.claim_ready_recording_processing_jobs('worker-a',array['transcription'],1))
    then raise exception 'pending input was claimed'; end if;
  select * into replay from public.enqueue_recording_processing_job('transcription','audio-1',repeat('b',64),
    job.recording_key,job.doctor_key,job.clinic_key,1,10,100,'queue/audio-1.webm');
  if replay.id<>job.id then raise exception 'pending upload replay changed job'; end if;
  perform public.activate_queued_transcription_artifact(job.id,job.doctor_key,job.clinic_key,
    'queue/audio-1.webm',repeat('b',64));
  select * into claimed from public.claim_ready_recording_processing_jobs('worker-a',array['transcription'],1);
  if claimed.id<>job.id or claimed.lease_token is null then raise exception 'activated input was not claimed'; end if;
  update public.recording_processing_jobs set started_at=now()-interval '10 minutes',
    heartbeat_at=now()-interval '6 minutes',lease_expires_at=now()-interval '1 minute' where id=job.id;
  recovered:=public.recover_stale_recording_processing_jobs(now()+interval '1 day',now()+interval '30 seconds',25);
  if recovered<>1 or not exists(select 1 from public.recording_processing_jobs where id=job.id and job_state='retry_wait')
    then raise exception 'expired lease was not recovered'; end if;

  select * into job from public.enqueue_recording_processing_job('transcription','abandoned',repeat('c',64),
    'f6800000-0000-4000-8000-000000000104','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,10,100,'queue/abandoned.webm');
  update public.recording_processing_jobs set created_at=now()-interval '16 minutes' where id=job.id;
  recovered:=public.recover_stale_recording_processing_jobs(now(),now()+interval '30 seconds',25);
  if recovered<>1 or not exists(select 1 from public.recording_processing_jobs where id=job.id and job_state='cancelled')
    or not exists(select 1 from public.processing_artifacts where job_id=job.id and state='orphaned')
    then raise exception 'abandoned pending upload was not cleaned'; end if;
  perform public.request_recording_deletion(job.recording_key,job.doctor_key);
  if exists(select 1 from public.recordings where id=job.recording_key)
    then raise exception 'cleaned queue job blocked recording deletion'; end if;

  select * into job from public.enqueue_recording_processing_job('transcription','session-block',repeat('d',64),
    'f6800000-0000-4000-8000-000000000105','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,10,100,'queue/session.webm');
  blocked:=false;
  begin insert into public.transcription_sessions(recording_id,doctor_id,clinic_id,expected_chunk_count,language,model,idempotency_key)
    values(job.recording_key,job.doctor_key,job.clinic_key,1,'auto','model','session-after-queue');
  exception when sqlstate 'P0001' then blocked:=sqlerrm='TRANSCRIPTION_SESSION_ACTIVE'; end;
  if not blocked then raise exception 'session started over queue job'; end if;

  insert into public.transcription_sessions(recording_id,doctor_id,clinic_id,expected_chunk_count,language,model,idempotency_key)
  values('f6800000-0000-4000-8000-000000000106','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,'auto','model','session-first');
  blocked:=false;
  begin perform public.enqueue_recording_processing_job('transcription','queue-after-session',repeat('e',64),
    'f6800000-0000-4000-8000-000000000106','f6800000-0000-4000-8000-000000000011',
    'f6800000-0000-4000-8000-000000000001',1,10,100,'queue/after-session.webm');
  exception when sqlstate 'P0001' then blocked:=sqlerrm='PROCESSING_RECORDING_BUSY'; end;
  if not blocked then raise exception 'queue job started over session'; end if;

  select * into job from public.enqueue_recording_processing_job('summary','terminal',repeat('f',64),
    'f6800000-0000-4000-8000-000000000103','f6800000-0000-4000-8000-000000000012',
    'f6800000-0000-4000-8000-000000000002',1,0,0,null);
  select * into claimed from public.claim_ready_recording_processing_jobs('worker-b',array['summary'],1);
  perform public.fail_recording_processing_job(claimed.id,claimed.lease_token,'PROVIDER_TERMINAL');
  if not exists(select 1 from public.recording_processing_jobs where id=job.id and job_state='failed_terminal')
    then raise exception 'terminal failure was retried'; end if;
  insert into public.processing_artifacts(job_id,recording_key,kind,storage_path,byte_size,checksum,state)
    values(job.id,job.recording_key,'pdf','queue/quota-baseline.pdf',2140143616,repeat('1',64),'current');
  select * into job from public.enqueue_recording_processing_job('pdf','pdf-reserved',repeat('2',64),
    'f6800000-0000-4000-8000-000000000107','f6800000-0000-4000-8000-000000000012',
    'f6800000-0000-4000-8000-000000000002',1,0,5242880,null);
  select * into claimed from public.claim_ready_recording_processing_jobs('worker-b',array['pdf'],1);
  if claimed.id<>job.id then raise exception 'first storage reservation was not admitted'; end if;
  insert into public.processing_artifacts(job_id,recording_key,kind,storage_path,byte_size,checksum,state)
    values(claimed.id,claimed.recording_key,'pdf','queue/orphan-only.pdf',1,repeat('4',64),'orphaned');
  perform public.enqueue_recording_processing_job('pdf','pdf-over-quota',repeat('3',64),
    'f6800000-0000-4000-8000-000000000108','f6800000-0000-4000-8000-000000000012',
    'f6800000-0000-4000-8000-000000000002',1,0,5242880,null);
  if exists(select 1 from public.claim_ready_recording_processing_jobs('worker-b',array['pdf'],1))
    then raise exception 'running storage reservation was omitted from quota'; end if;
  perform public.fail_recording_processing_job(claimed.id,claimed.lease_token,'patient P-68 secret');
  if not exists(select 1 from public.recording_processing_jobs where id=claimed.id
    and error_code='PROVIDER_RETRYABLE' and terminal_error_code='PROVIDER_RETRYABLE')
    then raise exception 'raw retry error was persisted'; end if;
end$$;

do $$begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='processing_job_status' and column_name='is_stale') then raise exception 'status lost is_stale'; end if;
  if has_table_privilege('authenticated','public.processing_queue_metrics','select')
    or has_function_privilege('authenticated',
      'public.claim_ready_recording_processing_jobs(text,text[],integer)','execute')
    then raise exception 'queue authority exposed'; end if;
end$$;

rollback;
