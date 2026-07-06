do $$
declare
  pgimer_clinic_id uuid;
begin
  select id
    into pgimer_clinic_id
  from public.clinics
  where clinic_code = 'PGIMER'
  limit 1;

  if pgimer_clinic_id is null then
    select id
      into pgimer_clinic_id
    from public.clinics
    where lower(name) like '%pgimer%'
       or lower(name) like '%postgraduate institute of medical education%'
    order by created_at asc
    limit 1;
  end if;

  if pgimer_clinic_id is null then
    insert into public.clinics (
      name,
      clinic_code,
      address
    )
    values (
      'Postgraduate Institute of Medical Education & Research, Chandigarh',
      'PGIMER',
      'Sector-12, Chandigarh PIN-160012, India'
    );
  else
    update public.clinics
    set
      name = 'Postgraduate Institute of Medical Education & Research, Chandigarh',
      clinic_code = 'PGIMER',
      address = coalesce(nullif(btrim(address), ''), 'Sector-12, Chandigarh PIN-160012, India')
    where id = pgimer_clinic_id;
  end if;
end;
$$;
