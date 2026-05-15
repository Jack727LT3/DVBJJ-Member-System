-- Out-of-store leads: website, phone, online signups — not yet visited the gym.

alter table public.people
  add column if not exists lead_source text,
  add column if not exists lead_contacted_at timestamptz,
  add column if not exists lead_notes text,
  add column if not exists lead_inquiry_source text;

create index if not exists people_lead_source_idx
  on public.people (lead_source)
  where status = 'lead';

-- List out-of-store leads for staff MVP.
create or replace function public.mvp_out_of_store_leads_list()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'phone', p.phone,
    'email', p.email,
    'created_at', p.created_at,
    'lead_inquiry_source', p.lead_inquiry_source,
    'lead_notes', p.lead_notes,
    'lead_contacted_at', p.lead_contacted_at,
    'contacted', (p.lead_contacted_at is not null)
  ) order by
    (p.lead_contacted_at is null) desc,
    p.created_at desc
  ), '[]'::jsonb)
  from public.people p
  where p.status = 'lead'
    and p.lead_source = 'out_of_store';
$$;

-- Create a manual out-of-store lead (no check-in).
create or replace function public.mvp_create_out_of_store_lead(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_inquiry_source text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_existing public.people%rowtype;
begin
  select * into v_existing from public.people where phone = p_phone;

  if found and v_existing.status <> 'lead' then
    return jsonb_build_object('ok', false, 'error', 'phone_in_use');
  end if;

  if found then
    update public.people
    set
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      lead_source = 'out_of_store',
      lead_inquiry_source = coalesce(nullif(trim(coalesce(p_inquiry_source, '')), ''), lead_inquiry_source),
      lead_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), lead_notes)
    where id = v_existing.id
    returning * into v_person;
  else
    insert into public.people (
      first_name,
      last_name,
      phone,
      email,
      status,
      lead_source,
      lead_inquiry_source,
      lead_notes
    )
    values (
      trim(p_first_name),
      trim(p_last_name),
      p_phone,
      nullif(trim(coalesce(p_email, '')), ''),
      'lead',
      'out_of_store',
      nullif(trim(coalesce(p_inquiry_source, '')), ''),
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning * into v_person;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'created_at', v_person.created_at,
      'lead_inquiry_source', v_person.lead_inquiry_source,
      'lead_notes', v_person.lead_notes,
      'lead_contacted_at', v_person.lead_contacted_at,
      'contacted', (v_person.lead_contacted_at is not null)
    )
  );
end;
$$;

-- Mark contacted / not contacted.
create or replace function public.mvp_set_out_of_store_lead_contacted(
  p_person_id uuid,
  p_contacted boolean
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set lead_contacted_at = case when p_contacted then now() else null end
  where id = p_person_id
    and status = 'lead'
    and lead_source = 'out_of_store'
  returning * into v_person;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_contacted then
    insert into public.lead_activity (person_id, contact_type, notes)
    values (p_person_id, 'call', 'Marked contacted from staff dashboard');
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'created_at', v_person.created_at,
      'lead_inquiry_source', v_person.lead_inquiry_source,
      'lead_notes', v_person.lead_notes,
      'lead_contacted_at', v_person.lead_contacted_at,
      'contacted', (v_person.lead_contacted_at is not null)
    )
  );
end;
$$;

-- Overview "Leads" list: in-store / kiosk leads only (not out-of-store).
create or replace function public.admin_people_list(p_status people_status)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  perform public.admin_expire_trials();

  if p_status = 'member' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'join_date', p.created_at,
        'last_visit', p.last_check_in,
        'total_visits', p.total_check_ins,
        'member_state', p.member_state
      ) order by p.created_at desc), '[]'::jsonb)
      from public.people p
      where p.status = 'member'
    );
  end if;

  if p_status = 'trial' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'trial_end_date', p.trial_end_date,
        'days_remaining',
          greatest(
            0,
            ceil(extract(epoch from (p.trial_end_date - v_now)) / 86400)
          )::int
      ) order by p.trial_end_date asc), '[]'::jsonb)
      from public.people p
      where p.status = 'trial'
    );
  end if;

  if p_status = 'guest' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'created_at', p.created_at,
        'last_visit', p.last_check_in
      ) order by p.created_at desc), '[]'::jsonb)
      from public.people p
      where p.status = 'guest'
    );
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'created_at', p.created_at,
      'contact_attempts',
        coalesce(la.contact_attempts, 0),
      'last_contact_date',
        la.last_contact_date
    ) order by p.created_at desc), '[]'::jsonb)
    from public.people p
    left join lateral (
      select
        count(*) as contact_attempts,
        max(l.contact_date) as last_contact_date
      from public.lead_activity l
      where l.person_id = p.id
    ) la on true
    where p.status = 'lead'
      and coalesce(p.lead_source, '') <> 'out_of_store'
  );
end;
$$;
