create or replace function public.review_clinic_join_request(
  p_request_id uuid,
  p_doctor_id uuid,
  p_owner_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_rows integer;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid join request review status: %', p_status
      using errcode = '22023';
  end if;

  update public.clinic_join_requests
  set
    status = p_status,
    rejection_reason = case when p_status = 'rejected' then p_rejection_reason else null end,
    reviewed_at = now(),
    reviewed_by = p_owner_id
  where id = p_request_id
    and doctor_id = p_doctor_id
    and status = 'pending';

  get diagnostics changed_rows = row_count;

  if changed_rows <> 1 then
    raise exception 'Pending join request was not found or was already reviewed.'
      using errcode = 'P0002';
  end if;

  update public.doctors
  set account_status = case when p_status = 'approved' then 'active' else 'rejected' end
  where id = p_doctor_id;

  get diagnostics changed_rows = row_count;

  if changed_rows <> 1 then
    raise exception 'Doctor profile was not found.'
      using errcode = 'P0002';
  end if;
end;
$$;
