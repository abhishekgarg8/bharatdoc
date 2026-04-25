create or replace function public.create_owner_account(
  p_auth_uid text,
  p_phone text,
  p_name text,
  p_specialization text,
  p_profile_photo_path text,
  p_clinic_name text,
  p_clinic_code text,
  p_clinic_address text default null,
  p_logo_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_doctor public.doctors%rowtype;
  new_clinic public.clinics%rowtype;
  new_doctor public.doctors%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_auth_uid)::bigint);

  select *
    into existing_doctor
  from public.doctors
  where firebase_uid = p_auth_uid;

  if existing_doctor.id is not null then
    return jsonb_build_object('existing_doctor', to_jsonb(existing_doctor));
  end if;

  insert into public.clinics (
    name,
    clinic_code,
    address,
    logo_storage_path
  )
  values (
    p_clinic_name,
    p_clinic_code,
    nullif(btrim(coalesce(p_clinic_address, '')), ''),
    nullif(btrim(coalesce(p_logo_storage_path, '')), '')
  )
  returning * into new_clinic;

  insert into public.doctors (
    firebase_uid,
    clinic_id,
    role,
    account_status,
    name,
    specialization,
    phone,
    profile_photo_path,
    transcription_lang
  )
  values (
    p_auth_uid,
    new_clinic.id,
    'owner',
    'active',
    p_name,
    p_specialization,
    p_phone,
    nullif(btrim(coalesce(p_profile_photo_path, '')), ''),
    'auto'
  )
  returning * into new_doctor;

  return jsonb_build_object(
    'clinic', to_jsonb(new_clinic),
    'doctor', to_jsonb(new_doctor)
  );
end;
$$;

create or replace function public.create_doctor_join_request(
  p_auth_uid text,
  p_phone text,
  p_name text,
  p_specialization text,
  p_profile_photo_path text,
  p_clinic_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_doctor public.doctors%rowtype;
  target_clinic public.clinics%rowtype;
  new_doctor public.doctors%rowtype;
  new_join_request public.clinic_join_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_auth_uid)::bigint);

  select *
    into existing_doctor
  from public.doctors
  where firebase_uid = p_auth_uid;

  if existing_doctor.id is not null then
    return jsonb_build_object('existing_doctor', to_jsonb(existing_doctor));
  end if;

  select *
    into target_clinic
  from public.clinics
  where id = p_clinic_id;

  if target_clinic.id is null then
    raise exception 'Hospital was not found.'
      using errcode = 'P0002';
  end if;

  insert into public.doctors (
    firebase_uid,
    clinic_id,
    role,
    account_status,
    name,
    specialization,
    phone,
    profile_photo_path,
    transcription_lang
  )
  values (
    p_auth_uid,
    target_clinic.id,
    'doctor',
    'pending_approval',
    p_name,
    p_specialization,
    p_phone,
    nullif(btrim(coalesce(p_profile_photo_path, '')), ''),
    'auto'
  )
  returning * into new_doctor;

  insert into public.clinic_join_requests (
    clinic_id,
    doctor_id,
    status
  )
  values (
    target_clinic.id,
    new_doctor.id,
    'pending'
  )
  returning * into new_join_request;

  return jsonb_build_object(
    'clinic', to_jsonb(target_clinic),
    'doctor', to_jsonb(new_doctor),
    'join_request', to_jsonb(new_join_request)
  );
end;
$$;

revoke all on function public.create_owner_account(text, text, text, text, text, text, text, text, text) from public;
revoke execute on function public.create_owner_account(text, text, text, text, text, text, text, text, text) from anon;
revoke execute on function public.create_owner_account(text, text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.create_owner_account(text, text, text, text, text, text, text, text, text) to service_role;

revoke all on function public.create_doctor_join_request(text, text, text, text, text, uuid) from public;
revoke execute on function public.create_doctor_join_request(text, text, text, text, text, uuid) from anon;
revoke execute on function public.create_doctor_join_request(text, text, text, text, text, uuid) from authenticated;
grant execute on function public.create_doctor_join_request(text, text, text, text, text, uuid) to service_role;
