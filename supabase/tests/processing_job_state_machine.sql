\set ON_ERROR_STOP on
begin;

insert into public.clinics(id,name,clinic_code)
values('f6700000-0000-4000-8000-000000000001','Issue 67','ISSU67');
insert into public.doctors(id,firebase_uid,clinic_id,role,account_status,name,specialization,phone)
values('f6700000-0000-4000-8000-000000000002','issue-67-doctor',
  'f6700000-0000-4000-8000-000000000001','owner','active','Issue 67','Testing','+910000000067');
insert into public.recordings(id,doctor_id,clinic_id,status,recorded_at)
select id::uuid,'f6700000-0000-4000-8000-000000000002','f6700000-0000-4000-8000-000000000001',status,now()
from (values
  ('f6700000-0000-4000-8000-000000000101','recorded'),
  ('f6700000-0000-4000-8000-000000000102','recorded'),
  ('f6700000-0000-4000-8000-000000000103','recorded'),
  ('f6700000-0000-4000-8000-000000000104','summary_ready'),
  ('f6700000-0000-4000-8000-000000000105','recorded')) fixture(id,status);

do $$
declare job public.recording_processing_jobs%rowtype; replay public.recording_processing_jobs%rowtype;
  lease uuid; recovered integer; conflict_seen boolean:=false;
begin
  select * into job from public.create_recording_processing_job('transcription','create-1',repeat('a',64),
    'f6700000-0000-4000-8000-000000000101','f6700000-0000-4000-8000-000000000002',
    'f6700000-0000-4000-8000-000000000001');
  select * into replay from public.create_recording_processing_job('transcription','create-1',repeat('a',64),
    'f6700000-0000-4000-8000-000000000101','f6700000-0000-4000-8000-000000000002',
    'f6700000-0000-4000-8000-000000000001');
  if job.id<>replay.id or job.job_state<>'queued' or job.state<>'running' then raise exception 'create replay failed'; end if;
  begin
    perform public.create_recording_processing_job('summary','active-conflict',repeat('b',64),job.recording_key,
      job.doctor_key,job.clinic_key);
  exception when sqlstate 'P0001' then conflict_seen:=sqlerrm='PROCESSING_ACTIVE_CONFLICT'; end;
  if not conflict_seen then raise exception 'one-active invariant failed'; end if;

  select * into job from public.transition_recording_processing_job(job.id,'queued','running',0,null,'worker-a');
  lease:=job.lease_token; conflict_seen:=false;
  perform public.request_processing_job_cancellation(job.id,job.doctor_key,job.clinic_key,1);
  begin perform public.request_processing_job_cancellation(job.id,job.doctor_key,job.clinic_key,1);
  exception when sqlstate 'P0001' then conflict_seen:=sqlerrm='PROCESSING_STATE_CONFLICT'; end;
  if not conflict_seen then raise exception 'version CAS failed'; end if;
  update public.recording_processing_jobs set lease_expires_at=now()-interval '1 second' where id=job.id;
  recovered:=public.recover_stale_processing_jobs(now(),now()+interval '1 second',10);
  if recovered<>1 or not exists(select 1 from public.recording_processing_jobs where id=job.id and job_state='cancelled')
    then raise exception 'stale cancellation recovery failed'; end if;

  select * into job from public.create_recording_processing_job('summary','retry-1',repeat('c',64),
    'f6700000-0000-4000-8000-000000000102','f6700000-0000-4000-8000-000000000002',
    'f6700000-0000-4000-8000-000000000001');
  select * into job from public.transition_recording_processing_job(job.id,'queued','running',0,null,'worker-a');
  select * into job from public.transition_recording_processing_job(job.id,'running','retry_wait',1,
    job.lease_token,null,now()+interval '1 millisecond','PROVIDER_RETRYABLE');
  update public.recording_processing_jobs set next_retry_at=now()-interval '1 millisecond' where id=job.id;
  select * into job from public.transition_recording_processing_job(job.id,'retry_wait','running',2,null,'worker-b');
  if job.attempt<>2 or job.state_version<>3 then raise exception 'retry claim did not consume one attempt'; end if;

  select * into job from public.create_recording_processing_job('transcription','artifact-1',repeat('d',64),
    'f6700000-0000-4000-8000-000000000104','f6700000-0000-4000-8000-000000000002',
    'f6700000-0000-4000-8000-000000000001');
  select * into job from public.transition_recording_processing_job(job.id,'queued','running',0,null,'worker-c');
  select * into job from public.transition_recording_processing_job(job.id,'running','succeeded',1,
    job.lease_token,null,null,null,jsonb_build_object('recording_status','transcribed'));
  if job.job_state<>'succeeded' then raise exception 'monotonic artifact outcome failed'; end if;
  conflict_seen:=false;
  begin update public.recording_processing_jobs set job_state='running' where id=job.id;
  exception when sqlstate 'P0001' then conflict_seen:=sqlerrm='PROCESSING_TRANSITION_INVALID'; end;
  if not conflict_seen then raise exception 'terminal state resurrected'; end if;

  select * into job from public.create_recording_processing_job('pdf','artifact-bad',repeat('e',64),
    'f6700000-0000-4000-8000-000000000104','f6700000-0000-4000-8000-000000000002',
    'f6700000-0000-4000-8000-000000000001');
  select * into job from public.transition_recording_processing_job(job.id,'queued','running',0,null,'worker-d');
  conflict_seen:=false;
  begin perform public.transition_recording_processing_job(job.id,'running','succeeded',1,job.lease_token,
    null,null,null,jsonb_build_object('recording_status','pdf_saved'));
  exception when sqlstate 'P0001' then conflict_seen:=sqlerrm='PROCESSING_ARTIFACT_INCONSISTENT'; end;
  if not conflict_seen then raise exception 'inconsistent artifact accepted'; end if;

  perform public.create_recording_processing_job('transcription','deletion-guard',repeat('f',64),
    'f6700000-0000-4000-8000-000000000105','f6700000-0000-4000-8000-000000000002',
    'f6700000-0000-4000-8000-000000000001');
  conflict_seen:=false;
  begin perform public.request_recording_deletion('f6700000-0000-4000-8000-000000000105',
    'f6700000-0000-4000-8000-000000000002');
  exception when sqlstate 'P0001' then conflict_seen:=sqlerrm='RECORDING_PROCESSING_ACTIVE'; end;
  if not conflict_seen then raise exception 'queued job did not block deletion'; end if;
end;
$$;

do $$begin
  if exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='processing_job_status' and column_name in
      ('lease_token','lease_owner','lease_expires_at','result','output_reference','input_hash','terminal_error_message_raw'))
    then raise exception 'status view exposes internal data'; end if;
  if has_table_privilege('authenticated','public.processing_job_events','select')
    or has_function_privilege('authenticated',
      'public.transition_recording_processing_job(uuid,text,text,bigint,uuid,text,timestamptz,text,jsonb)','execute')
    then raise exception 'processing state authority exposed'; end if;
end$$;

rollback;
