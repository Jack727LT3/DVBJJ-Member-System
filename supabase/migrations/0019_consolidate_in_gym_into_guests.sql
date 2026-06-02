-- Former "in-gym leads" are guests; first kiosk visit still starts a trial.

update public.people
set status = 'guest', lead_source = null
where status = 'lead'
  and coalesce(lead_source, '') <> 'out_of_store';

-- Out-of-store promote -> guest (ready for kiosk / trial on first visit).
create or replace function public.mvp_promote_out_of_store_lead(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set status = 'guest', lead_source = null
  where id = p_person_id
    and status = 'lead'
    and lead_source = 'out_of_store'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'guest_id', v_person.id);
end;
$$;

-- Staff-created guest (replaces in-gym lead).
create or replace function public.mvp_create_guest(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_existing public.people%rowtype;
begin
  select * into v_existing from public.people where phone = p_phone;

  if found and v_existing.status not in ('guest', 'lead') then
    return jsonb_build_object('ok', false, 'error', 'phone_in_use');
  end if;

  if found and v_existing.status = 'lead' and coalesce(v_existing.lead_source, '') = 'out_of_store' then
    return jsonb_build_object('ok', false, 'error', 'out_of_store_lead');
  end if;

  if found then
    update public.people
    set
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      status = 'guest',
      lead_source = null
    where id = v_existing.id
    returning * into v_person;
  else
    insert into public.people (first_name, last_name, phone, email, status, lead_source)
    values (
      trim(p_first_name),
      trim(p_last_name),
      p_phone,
      nullif(trim(coalesce(p_email, '')), ''),
      'guest',
      null
    )
    returning * into v_person;
  end if;

  return jsonb_build_object(
    'ok', true,
    'guest', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'created_at', v_person.created_at,
      'last_visit', v_person.last_check_in,
      'total_visits', v_person.total_check_ins,
      'completed_trial', coalesce(v_person.completed_trial, false)
    )
  );
end;
$$;

-- Kiosk trial signup creates a guest; first check-in starts the trial.
create or replace function public.kiosk_create_guest_and_check_in(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_start_trial boolean default true,
  p_force_new_person boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_person_id uuid;
  v_status people_status;
  v_existing public.people%rowtype;
begin
  v_status := 'guest'::people_status;

  if coalesce(p_force_new_person, false) then
    select * into v_existing
    from public.people
    where phone = p_phone
      and lower(trim(first_name)) = lower(trim(p_first_name))
      and lower(trim(last_name)) = lower(trim(p_last_name))
    limit 1;

    if found then
      v_person_id := v_existing.id;
      update public.people
      set email = coalesce(nullif(trim(p_email), ''), email)
      where id = v_person_id;
    else
      insert into public.people (first_name, last_name, phone, email, status, member_state)
      values (trim(p_first_name), trim(p_last_name), p_phone, nullif(trim(p_email), ''), v_status, null)
      returning id into v_person_id;
    end if;

    return public.kiosk_check_in(v_person_id);
  end if;

  select * into v_existing
  from public.people
  where phone = p_phone
    and lower(trim(first_name)) = lower(trim(p_first_name))
    and lower(trim(last_name)) = lower(trim(p_last_name))
  limit 1;

  if found then
    v_person_id := v_existing.id;
    update public.people
    set
      email = coalesce(nullif(trim(p_email), ''), email),
      status = case
        when status in ('member', 'trial', 'professor') then status
        when coalesce(lead_source, '') = 'out_of_store' then status
        else 'guest'::people_status
      end
    where id = v_person_id;
  else
    insert into public.people (first_name, last_name, phone, email, status, member_state)
    values (trim(p_first_name), trim(p_last_name), p_phone, nullif(trim(p_email), ''), v_status, null)
    returning id into v_person_id;
  end if;

  return public.kiosk_check_in(v_person_id);
end;
$$;

-- First visit: out-of-store leads OR new guests (never checked in) start trial.
create or replace function public.kiosk_check_in(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_person public.people%rowtype;
  v_lead_first_visit boolean := false;
begin
  select * into v_person from public.people where id = p_person_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_person.status = 'trial' and v_person.trial_end_date is not null and v_person.trial_end_date <= v_now then
    update public.people set status = 'guest', member_state = null, completed_trial = true where id = p_person_id;
    v_person.status := 'guest';
    v_person.member_state := null;
  end if;

  if v_person.status = 'lead'
     and coalesce(v_person.lead_source, '') <> 'out_of_store'
     and (v_person.total_check_ins = 0 or v_person.last_check_in is null) then
    update public.people
    set status = 'trial',
        trial_start_date = v_now,
        trial_end_date = v_now + interval '7 days'
    where id = p_person_id;
    v_person.status := 'trial';
    v_lead_first_visit := true;
  elsif v_person.status = 'guest'
     and coalesce(v_person.completed_trial, false) = false
     and (v_person.total_check_ins = 0 or v_person.last_check_in is null)
     and coalesce(v_person.lead_source, '') <> 'out_of_store' then
    update public.people
    set status = 'trial',
        trial_start_date = v_now,
        trial_end_date = v_now + interval '7 days'
    where id = p_person_id;
    v_person.status := 'trial';
    v_lead_first_visit := true;
  end if;

  insert into public.check_ins (person_id, timestamp) values (p_person_id, v_now);
  update public.people
  set last_check_in = v_now, total_check_ins = total_check_ins + 1
  where id = p_person_id;

  select * into v_person from public.people where id = p_person_id;

  return jsonb_build_object(
    'ok', true,
    'person', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'status', v_person.status,
      'member_state', v_person.member_state,
      'trial_end_date', v_person.trial_end_date,
      'last_check_in', v_person.last_check_in
    ),
    'lead_first_visit', v_lead_first_visit
  );
end;
$$;
