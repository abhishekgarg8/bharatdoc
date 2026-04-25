create table if not exists public.transcription_attempts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references public.recordings(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  clinic_id uuid references public.clinics(id) on delete set null,
  request_id text not null,
  stage text not null,
  error_code text not null,
  error_message text not null,
  error_status integer,
  audio_storage_path text,
  created_at timestamptz not null default now(),
  constraint transcription_attempts_stage_check check (
    stage in (
      'validate_input',
      'load_recording',
      'validate_recording',
      'upload_audio',
      'transcribe_audio',
      'save_transcript'
    )
  ),
  constraint transcription_attempts_error_message_length check (char_length(error_message) <= 500)
);

create index if not exists idx_transcription_attempts_recording_date
  on public.transcription_attempts(recording_id, created_at desc);

create index if not exists idx_transcription_attempts_request
  on public.transcription_attempts(request_id);

alter table public.transcription_attempts enable row level security;
