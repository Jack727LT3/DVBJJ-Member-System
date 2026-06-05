-- Kiosk guest signup must not start a trial; only trial-intent signups (lead) do on first check-in.

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
  v_status := case when coalesce(p_start_trial, true) then 'lead'::people_status else 'guest'::people_status end;

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
        when coalesce(p_start_trial, true) and status = 'guest' then 'lead'::people_status
        when not coalesce(p_start_trial, true) and status = 'lead' then 'guest'::people_status
        else status
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

-- Trial starts only for in-gym kiosk leads (not out-of-store, not plain guests).
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
      'trial_start_date', v_person.trial_start_date,
      'trial_end_date', v_person.trial_end_date,
      'last_check_in', v_person.last_check_in
    ),
    'lead_first_visit', v_lead_first_visit
  );
end;
$$;

-- Staff can enroll guests or active trial members.
create or replace function public.mvp_enroll_guest(
  p_person_id uuid,
  p_belt_color text,
  p_monthly_payment numeric,
  p_member_age_group text default 'adult',
  p_date_of_birth date default null,
  p_member_parents jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_age_group text;
  v_parents jsonb;
  v_was_trial boolean;
begin
  v_age_group := lower(trim(coalesce(p_member_age_group, 'adult')));
  if v_age_group not in ('adult', 'child') then
    return jsonb_build_object('ok', false, 'error', 'invalid_age_group');
  end if;

  if p_monthly_payment is null or p_monthly_payment <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment');
  end if;

  if length(trim(coalesce(p_belt_color, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_belt');
  end if;

  v_parents := coalesce(p_member_parents, '[]'::jsonb);
  if jsonb_typeof(v_parents) <> 'array' then
    v_parents := '[]'::jsonb;
  end if;

  if v_age_group = 'child' and jsonb_array_length(v_parents) < 1 then
    return jsonb_build_object('ok', false, 'error', 'parent_required');
  end if;

  select * into v_person from public.people where id = p_person_id and status in ('guest', 'trial');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  v_was_trial := v_person.status = 'trial';

  update public.people
  set
    status = 'member',
    member_state = 'active',
    belt_color = trim(p_belt_color),
    monthly_payment = p_monthly_payment,
    member_age_group = v_age_group,
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    member_parents = v_parents,
    trial_start_date = null,
    trial_end_date = null,
    completed_trial = case when v_was_trial then true else completed_trial end
  where id = p_person_id
  returning * into v_person;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'join_date', v_person.created_at,
      'last_visit', v_person.last_check_in,
      'total_visits', v_person.total_check_ins,
      'member_state', v_person.member_state,
      'belt_color', v_person.belt_color,
      'monthly_payment', v_person.monthly_payment,
      'member_age_group', v_person.member_age_group,
      'member_parents', coalesce(v_person.member_parents, '[]'::jsonb),
      'date_of_birth', v_person.date_of_birth,
      'notes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', mn.id,
            'body', mn.body,
            'created_at', mn.created_at
          )
          order by mn.created_at desc
        )
        from public.member_notes mn
        where mn.person_id = v_person.id
        limit 20
      ), '[]'::jsonb)
    )
  );
end;
$$;
