-- Defense-in-depth RLS for direct authenticated Supabase clients.
-- BharatDoc server and worker code intentionally use service_role clients for
-- trusted workflows; service_role bypasses RLS unless FORCE RLS is enabled.

create or replace function public.current_authenticated_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.doctors
  where firebase_uid = auth.uid()::text
  limit 1
$$;

create or replace function public.current_authenticated_doctor_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select clinic_id
  from public.doctors
  where firebase_uid = auth.uid()::text
  limit 1
$$;

create or replace function public.current_active_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.doctors
  where firebase_uid = auth.uid()::text
    and account_status = 'active'
  limit 1
$$;

create or replace function public.current_active_doctor_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select clinic_id
  from public.doctors
  where firebase_uid = auth.uid()::text
    and account_status = 'active'
  limit 1
$$;

create or replace function public.current_active_owner_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select clinic_id
  from public.doctors
  where firebase_uid = auth.uid()::text
    and account_status = 'active'
    and role = 'owner'
  limit 1
$$;

revoke all on function public.current_authenticated_doctor_id() from public;
revoke all on function public.current_authenticated_doctor_clinic_id() from public;
revoke all on function public.current_active_doctor_id() from public;
revoke all on function public.current_active_doctor_clinic_id() from public;
revoke all on function public.current_active_owner_clinic_id() from public;

grant execute on function public.current_authenticated_doctor_id() to authenticated;
grant execute on function public.current_authenticated_doctor_clinic_id() to authenticated;
grant execute on function public.current_active_doctor_id() to authenticated;
grant execute on function public.current_active_doctor_clinic_id() to authenticated;
grant execute on function public.current_active_owner_clinic_id() to authenticated;

drop policy if exists clinics_select_active_members on public.clinics;
create policy clinics_select_active_members
on public.clinics
for select
to authenticated
using (id = public.current_active_doctor_clinic_id());

drop policy if exists clinics_update_active_owners on public.clinics;
create policy clinics_update_active_owners
on public.clinics
for update
to authenticated
using (id = public.current_active_owner_clinic_id())
with check (id = public.current_active_owner_clinic_id());

drop policy if exists doctors_select_own_or_clinic_members on public.doctors;
create policy doctors_select_own_or_clinic_members
on public.doctors
for select
to authenticated
using (
  id = public.current_authenticated_doctor_id()
  or (
    clinic_id = public.current_active_doctor_clinic_id()
    and account_status = 'active'
  )
  or clinic_id = public.current_active_owner_clinic_id()
);

-- No direct authenticated UPDATE policy is granted on public.doctors.
-- Profile/preferences and owner status workflows should stay RPC/service mediated
-- unless column grants are introduced for field-level safety.

drop policy if exists clinic_join_requests_select_own_or_owner on public.clinic_join_requests;
create policy clinic_join_requests_select_own_or_owner
on public.clinic_join_requests
for select
to authenticated
using (
  doctor_id = public.current_authenticated_doctor_id()
  or clinic_id = public.current_active_owner_clinic_id()
);

drop policy if exists clinic_join_requests_insert_own_pending on public.clinic_join_requests;
create policy clinic_join_requests_insert_own_pending
on public.clinic_join_requests
for insert
to authenticated
with check (
  doctor_id = public.current_authenticated_doctor_id()
  and clinic_id = public.current_authenticated_doctor_clinic_id()
  and status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

drop policy if exists clinic_join_requests_update_active_owners on public.clinic_join_requests;
create policy clinic_join_requests_update_active_owners
on public.clinic_join_requests
for update
to authenticated
using (clinic_id = public.current_active_owner_clinic_id())
with check (clinic_id = public.current_active_owner_clinic_id());

drop policy if exists recordings_select_active_clinic_members on public.recordings;
create policy recordings_select_active_clinic_members
on public.recordings
for select
to authenticated
using (clinic_id = public.current_active_doctor_clinic_id());

drop policy if exists recordings_insert_own_active_clinic on public.recordings;
create policy recordings_insert_own_active_clinic
on public.recordings
for insert
to authenticated
with check (
  doctor_id = public.current_active_doctor_id()
  and clinic_id = public.current_active_doctor_clinic_id()
);

drop policy if exists recordings_update_own_records on public.recordings;
create policy recordings_update_own_records
on public.recordings
for update
to authenticated
using (
  doctor_id = public.current_active_doctor_id()
  and clinic_id = public.current_active_doctor_clinic_id()
)
with check (
  doctor_id = public.current_active_doctor_id()
  and clinic_id = public.current_active_doctor_clinic_id()
);

drop policy if exists recordings_delete_own_records on public.recordings;
create policy recordings_delete_own_records
on public.recordings
for delete
to authenticated
using (
  doctor_id = public.current_active_doctor_id()
  and clinic_id = public.current_active_doctor_clinic_id()
);
