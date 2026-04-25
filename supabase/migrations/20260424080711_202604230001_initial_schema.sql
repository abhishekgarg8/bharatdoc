create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  clinic_code text not null unique,
  address text,
  logo_storage_path text,
  created_at timestamptz not null default now(),
  constraint clinics_code_format check (clinic_code ~ '^[A-Z2-9]{6}$')
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null unique,
  clinic_id uuid references public.clinics(id) on delete restrict,
  role text not null,
  account_status text not null,
  name text not null,
  specialization text not null,
  medical_reg_no text,
  phone text not null,
  profile_photo_path text,
  custom_prompt text,
  transcription_lang text not null default 'auto',
  created_at timestamptz not null default now(),
  constraint doctors_role_check check (role in ('owner', 'doctor')),
  constraint doctors_account_status_check check (account_status in ('pending_approval', 'active', 'rejected')),
  constraint doctors_transcription_lang_check check (transcription_lang in ('auto', 'hi', 'en', 'hien'))
);

create table if not exists public.clinic_join_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  status text not null,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.doctors(id) on delete set null,
  constraint clinic_join_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create table if not exists public.recordings (
  id uuid primary key,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id text,
  label text,
  duration_seconds integer,
  audio_storage_path text,
  transcript text,
  summary text,
  pdf_storage_path text,
  status text not null,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint recordings_duration_nonnegative check (duration_seconds is null or duration_seconds >= 0),
  constraint recordings_status_check check (status in ('recorded', 'transcribed', 'summary_ready', 'pdf_saved'))
);

create index if not exists idx_recordings_doctor_date
  on public.recordings(doctor_id, recorded_at desc);

create index if not exists idx_recordings_clinic_patient
  on public.recordings(clinic_id, patient_id);

create index if not exists idx_join_requests_clinic_status
  on public.clinic_join_requests(clinic_id, status);

create unique index if not exists idx_clinics_code
  on public.clinics(clinic_code);

create unique index if not exists idx_one_pending_request
  on public.clinic_join_requests(doctor_id)
  where status = 'pending';

alter table public.clinics enable row level security;
alter table public.doctors enable row level security;
alter table public.clinic_join_requests enable row level security;
alter table public.recordings enable row level security;

insert into storage.buckets (id, name, public)
values
  ('audio', 'audio', false),
  ('pdfs', 'pdfs', false),
  ('assets', 'assets', false)
on conflict (id) do update set public = excluded.public;
;
