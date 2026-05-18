create table if not exists public.diagnostic_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  level text not null,
  event text not null,
  message text,
  doctor_id uuid references public.doctors(id) on delete set null,
  clinic_id uuid references public.clinics(id) on delete set null,
  recording_id uuid references public.recordings(id) on delete set null,
  patient_id text,
  request_id text,
  session_id text,
  device_id text,
  app_version text,
  user_agent text,
  url text,
  client_created_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint diagnostic_logs_source_check check (source in ('device', 'web', 'worker')),
  constraint diagnostic_logs_level_check check (level in ('debug', 'info', 'warn', 'error')),
  constraint diagnostic_logs_event_length check (char_length(event) between 1 and 120),
  constraint diagnostic_logs_message_length check (message is null or char_length(message) <= 500),
  constraint diagnostic_logs_patient_id_length check (patient_id is null or char_length(patient_id) <= 120),
  constraint diagnostic_logs_request_id_length check (request_id is null or char_length(request_id) <= 120),
  constraint diagnostic_logs_session_id_length check (session_id is null or char_length(session_id) <= 120),
  constraint diagnostic_logs_device_id_length check (device_id is null or char_length(device_id) <= 120)
);

create index if not exists idx_diagnostic_logs_recording_date
  on public.diagnostic_logs(recording_id, created_at desc);

create index if not exists idx_diagnostic_logs_clinic_date
  on public.diagnostic_logs(clinic_id, created_at desc);

create index if not exists idx_diagnostic_logs_device_date
  on public.diagnostic_logs(device_id, created_at desc);

create index if not exists idx_diagnostic_logs_request
  on public.diagnostic_logs(request_id);

alter table public.diagnostic_logs enable row level security;

alter table public.transcription_attempts
  add column if not exists audio_size_bytes integer,
  add column if not exists audio_mime_type text,
  add column if not exists upstream_status integer,
  add column if not exists upstream_code text,
  add column if not exists upstream_type text,
  add column if not exists upstream_message text,
  add column if not exists upstream_param text;

alter table public.transcription_attempts
  drop constraint if exists transcription_attempts_stage_check;

alter table public.transcription_attempts
  add constraint transcription_attempts_stage_check check (
    stage in (
      'validate_input',
      'load_recording',
      'validate_recording',
      'upload_audio',
      'download_audio',
      'transcribe_audio',
      'save_transcript'
    )
  );

create index if not exists idx_transcription_attempts_error_date
  on public.transcription_attempts(error_code, created_at desc);
