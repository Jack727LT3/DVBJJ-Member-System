-- Family accounts (shared phone), staff check-in, status conversions, out-of-store kiosk flow.

-- Allow multiple people per phone; unique per name on that phone.
alter table public.people drop constraint if exists people_phone_key;
drop index if exists public.people_phone_name_unique;
create unique index people_phone_name_unique
  on public.people (phone, lower(trim(first_name)), lower(trim(last_name)));
create index if not exists people_phone_idx on public.people (phone);

-- Append a parent/guardian contact to member_parents jsonb.
create or replace function public.mvp_add_member_parent(
  p_person_id uuid,
  p_name text,
  p_phone text,
  p_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_entry jsonb;
  v_parents jsonb;
begin
  if length(trim(coalesce(p_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  v_entry := jsonb_build_object(
    'name', trim(p_name),
    'phone', regexp_replace(p_phone, '\D', '', 'g'),
    'email', nullif(trim(coalesce(p_email, '')), '')
  );

  update public.people
  set member_parents = coalesce(member_parents, '[]'::jsonb) || jsonb_build_array(v_entry)
  where id = p_person_id and status in ('member', 'trial', 'guest', 'lead', 'professor'::people_status)
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'parents', coalesce(v_person.member_parents, '[]'::jsonb)
  );
end;
$$;

-- Staff manual check-in for a member.
create or replace function public.mvp_staff_check_in(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_person public.people%rowtype;
begin
  select * into v_person from public.people where id = p_person_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_person.status not in ('member', 'professor') then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  if v_person.member_state = 'canceled' then
    return jsonb_build_object('ok', false, 'error', 'canceled');
  end if;

  insert into public.check_ins (person_id, timestamp) values (p_person_id, v_now);

  update public.people
  set last_check_in = v_now, total_check_ins = total_check_ins + 1
  where id = p_person_id
  returning * into v_person;

  return jsonb_build_object(
    'ok', true,
    'last_check_in', v_person.last_check_in,
    'total_check_ins', v_person.total_check_ins
  );
end;
$$;

create or replace function public.mvp_list_attendance(
  p_person_id uuid,
  p_limit int default 50
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'at', c.timestamp
  ) order by c.timestamp desc), '[]'::jsonb)
  from (
    select id, timestamp
    from public.check_ins
    where person_id = p_person_id
    order by timestamp desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) c;
$$;

-- Canceled member back to guest.
create or replace function public.mvp_member_convert_to_guest(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set
    status = 'guest',
    member_state = null,
    belt_color = null,
    monthly_payment = null,
    staff_flag_type = null,
    staff_flag_other = null
  where id = p_person_id and status = 'member' and member_state = 'canceled'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_canceled_member');
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
      'date_of_birth', v_person.date_of_birth,
      'completed_trial', coalesce(v_person.completed_trial, false)
    )
  );
end;
$$;

-- Expired trial -> guest (keeps completed_trial when had trial dates).
create or replace function public.mvp_trial_convert_to_guest(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_had_trial boolean;
begin
  select * into v_person from public.people where id = p_person_id and status = 'trial';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_trial');
  end if;

  v_had_trial := v_person.trial_start_date is not null or v_person.trial_end_date is not null;

  update public.people
  set
    status = 'guest',
    member_state = null,
    trial_start_date = null,
    trial_end_date = null,
    completed_trial = case when v_had_trial then true else completed_trial end
  where id = p_person_id
  returning * into v_person;

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
      'date_of_birth', v_person.date_of_birth,
      'completed_trial', coalesce(v_person.completed_trial, false)
    )
  );
end;
$$;

-- Out-of-store lead -> in-gym lead (shows on onboarding in-store list).
create or replace function public.mvp_promote_out_of_store_lead(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set lead_source = null
  where id = p_person_id
    and status = 'lead'
    and lead_source = 'out_of_store'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'lead_id', v_person.id);
end;
$$;

-- Family kiosk signup: always insert a new person when names differ on shared phone.
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

-- Out-of-store leads: defer auto trial until waiver; staff/kiosk handles profile first.
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
      'trial_end_date', v_person.trial_end_date,
      'last_check_in', v_person.last_check_in
    ),
    'lead_first_visit', v_lead_first_visit
  );
end;
$$;

-- Allow family members on shared phone for staff-created members.
create or replace function public.mvp_create_member(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_monthly_payment numeric,
  p_belt_color text default null,
  p_member_age_group text default 'adult',
  p_date_of_birth date default null,
  p_member_parents jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_phone text;
  v_age_group text;
  v_parents jsonb;
  v_belt text;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  if length(trim(coalesce(p_first_name, ''))) < 1 or length(trim(coalesce(p_last_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if length(trim(coalesce(p_email, ''))) < 3 or position('@' in trim(p_email)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  if p_monthly_payment is null or p_monthly_payment <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment');
  end if;

  v_age_group := lower(trim(coalesce(p_member_age_group, 'adult')));
  if v_age_group not in ('adult', 'child') then
    return jsonb_build_object('ok', false, 'error', 'invalid_age_group');
  end if;

  v_parents := coalesce(p_member_parents, '[]'::jsonb);
  if v_age_group = 'child' and jsonb_array_length(v_parents) < 1 then
    return jsonb_build_object('ok', false, 'error', 'parent_required');
  end if;

  v_belt := nullif(trim(coalesce(p_belt_color, '')), '');

  if exists (
    select 1 from public.people
    where phone = v_phone
      and lower(trim(first_name)) = lower(trim(p_first_name))
      and lower(trim(last_name)) = lower(trim(p_last_name))
  ) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_person');
  end if;

  insert into public.people (
    first_name, last_name, phone, email, status, member_state,
    belt_color, monthly_payment, member_age_group, date_of_birth, member_parents
  )
  values (
    trim(p_first_name), trim(p_last_name), v_phone, trim(p_email),
    'member', 'active', v_belt, p_monthly_payment, v_age_group, p_date_of_birth, v_parents
  )
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
      'notes', '[]'::jsonb
    )
  );
end;
$$;
