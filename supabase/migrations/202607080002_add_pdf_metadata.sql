alter table public.recordings
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists pdf_version text;

update public.recordings
set
  pdf_generated_at = coalesce(pdf_generated_at, created_at),
  pdf_version = coalesce(pdf_version, 'v1')
where pdf_storage_path is not null;
