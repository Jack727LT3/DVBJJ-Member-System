-- Staff flags, liability waiver storage, professor accounts, kiosk trial vs guest signup.

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'people_status' and e.enumlabel = 'professor'
  ) then
    alter type people_status add value 'professor';
  end if;
end
$$;

alter table public.people
  add column if not exists staff_flag_type text,
  add column if not exists staff_flag_other text;

alter table public.people
  drop constraint if exists people_staff_flag_type_check;

alter table public.people
  add constraint people_staff_flag_type_check check (
    staff_flag_type is null
    or staff_flag_type in ('missed_payment', 'absent_week_plus', 'other')
  );

create table if not exists public.liability_waivers (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  signed_at timestamptz not null default now(),
  date_of_birth date not null,
  participant_signature text not null,
  parent_name text,
  parent_signature text,
  parent_consent_date date,
  waiver_version text not null default '1'
);

create index if not exists liability_waivers_person_id_idx
  on public.liability_waivers(person_id, signed_at desc);

alter table public.liability_waivers enable row level security;

drop policy if exists "liability_waivers_deny_all" on public.liability_waivers;
create policy "liability_waivers_deny_all" on public.liability_waivers
  for all using (false) with check (false);

-- Include trial_start_date in kiosk check-in response for trial tracking.
create or replace function public.kiosk_check_in(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_person public.people%rowtype;
  v_lead_first_visit boolean := false;
begin
  select * into v_person
  from public.people
  where id = p_person_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_person.status = 'trial' and v_person.trial_end_date is not null and v_person.trial_end_date <= v_now then
    update public.people
    set status = 'guest',
        member_state = null
    where id = p_person_id;

    v_person.status := 'guest';
    v_person.member_state := null;
  end if;

  if v_person.status = 'lead'
     and (v_person.total_check_ins = 0 or v_person.last_check_in is null) then
    update public.people
    set status = 'trial',
        trial_start_date = v_now,
        trial_end_date = v_now + interval '7 days'
    where id = p_person_id;

    v_person.status := 'trial';
    v_person.trial_start_date := v_now;
    v_person.trial_end_date := v_now + interval '7 days';
    v_lead_first_visit := true;
  end if;

  insert into public.check_ins (person_id, timestamp)
  values (p_person_id, v_now);

  update public.people
  set last_check_in = v_now,
      total_check_ins = total_check_ins + 1
  where id = p_person_id;

  select * into v_person
  from public.people
  where id = p_person_id;

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

create or replace function public.kiosk_create_guest_and_check_in(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_start_trial boolean default true
)
returns jsonb
language plpgsql
as $$
declare
  v_person_id uuid;
  v_status people_status;
begin
  v_status := case when coalesce(p_start_trial, true) then 'lead'::people_status else 'guest'::people_status end;

  insert into public.people (
    first_name,
    last_name,
    phone,
    email,
    status,
    member_state
  )
  values (
    p_first_name,
    p_last_name,
    p_phone,
    p_email,
    v_status,
    null
  )
  on conflict (phone) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = coalesce(excluded.email, public.people.email),
      status = case
        when public.people.status in ('member', 'trial', 'professor') then public.people.status
        when coalesce(p_start_trial, true) and public.people.status = 'guest' then 'lead'::people_status
        when not coalesce(p_start_trial, true) and public.people.status = 'lead' then 'guest'::people_status
        else public.people.status
      end
  returning public.people.id into v_person_id;

  return public.kiosk_check_in(v_person_id);
end;
$$;

create or replace function public.kiosk_save_waiver(
  p_person_id uuid,
  p_date_of_birth date,
  p_participant_signature text,
  p_parent_name text default null,
  p_parent_signature text default null,
  p_parent_consent_date date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_waiver public.liability_waivers%rowtype;
begin
  if p_date_of_birth is null or length(trim(coalesce(p_participant_signature, ''))) < 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_waiver');
  end if;

  if not exists (select 1 from public.people where id = p_person_id) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.people
  set date_of_birth = p_date_of_birth
  where id = p_person_id;

  insert into public.liability_waivers (
    person_id,
    date_of_birth,
    participant_signature,
    parent_name,
    parent_signature,
    parent_consent_date
  )
  values (
    p_person_id,
    p_date_of_birth,
    p_participant_signature,
    nullif(trim(p_parent_name), ''),
    p_parent_signature,
    p_parent_consent_date
  )
  returning * into v_waiver;

  return jsonb_build_object(
    'ok', true,
    'waiver', jsonb_build_object(
      'id', v_waiver.id,
      'signed_at', v_waiver.signed_at,
      'date_of_birth', v_waiver.date_of_birth
    )
  );
end;
$$;

create or replace function public.mvp_set_member_flag(
  p_person_id uuid,
  p_flag_type text,
  p_flag_other text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_type text;
begin
  v_type := nullif(lower(trim(coalesce(p_flag_type, ''))), '');

  if v_type is not null and v_type not in ('missed_payment', 'absent_week_plus', 'other') then
    return jsonb_build_object('ok', false, 'error', 'invalid_flag');
  end if;

  if v_type = 'other' and length(trim(coalesce(p_flag_other, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'other_required');
  end if;

  update public.people
  set
    staff_flag_type = v_type,
    staff_flag_other = case when v_type = 'other' then trim(p_flag_other) else null end,
    member_state = case
      when v_type = 'missed_payment' then 'delinquent'::member_state
      when v_type is null and member_state = 'delinquent' then 'active'::member_state
      else member_state
    end
  where id = p_person_id and status = 'member'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', v_person.id,
      'staff_flag_type', v_person.staff_flag_type,
      'staff_flag_other', v_person.staff_flag_other,
      'member_state', v_person.member_state
    )
  );
end;
$$;

create or replace function public.mvp_update_member(
  p_person_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_monthly_payment numeric default null,
  p_belt_color text default null,
  p_date_of_birth date default null,
  p_member_age_group text default null,
  p_member_parents jsonb default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set
    first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
    last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    email = case when p_email is not null then nullif(trim(p_email), '') else email end,
    monthly_payment = coalesce(p_monthly_payment, monthly_payment),
    belt_color = case when p_belt_color is not null then nullif(trim(p_belt_color), '') else belt_color end,
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    member_age_group = coalesce(
      case when p_member_age_group in ('adult', 'child') then p_member_age_group else null end,
      member_age_group
    ),
    member_parents = coalesce(p_member_parents, member_parents)
  where id = p_person_id and status = 'member'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'member', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'member_state', v_person.member_state,
      'belt_color', v_person.belt_color,
      'monthly_payment', v_person.monthly_payment,
      'date_of_birth', v_person.date_of_birth,
      'member_age_group', v_person.member_age_group,
      'member_parents', coalesce(v_person.member_parents, '[]'::jsonb),
      'staff_flag_type', v_person.staff_flag_type,
      'staff_flag_other', v_person.staff_flag_other
    )
  );
end;
$$;

create or replace function public.mvp_update_person_profile(
  p_person_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_date_of_birth date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set
    first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
    last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    email = case when p_email is not null then nullif(trim(p_email), '') else email end,
    date_of_birth = coalesce(p_date_of_birth, date_of_birth)
  where id = p_person_id and status in ('trial', 'guest')
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'person', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'date_of_birth', v_person.date_of_birth
    )
  );
end;
$$;

create or replace function public.mvp_delete_person_note(
  p_person_id uuid,
  p_note_id uuid
)
returns jsonb
language plpgsql
as $$
begin
  delete from public.member_notes
  where id = p_note_id and person_id = p_person_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'note_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mvp_create_professor(
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
begin
  insert into public.people (
    first_name,
    last_name,
    phone,
    email,
    status,
    member_state
  )
  values (
    trim(p_first_name),
    trim(p_last_name),
    trim(p_phone),
    nullif(trim(p_email), ''),
    'professor',
    null
  )
  returning * into v_person;

  return jsonb_build_object(
    'ok', true,
    'professor', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'created_at', v_person.created_at
    )
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'phone_exists');
end;
$$;

create or replace function public.mvp_list_waivers(p_person_id uuid)
returns jsonb
language plpgsql
as $$
begin
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'signed_at', w.signed_at,
      'date_of_birth', w.date_of_birth,
      'participant_signature', w.participant_signature,
      'parent_name', w.parent_name,
      'parent_signature', w.parent_signature,
      'parent_consent_date', w.parent_consent_date
    ) order by w.signed_at desc), '[]'::jsonb)
    from public.liability_waivers w
    where w.person_id = p_person_id
  );
end;
$$;

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
        'phone', p.phone,
        'email', p.email,
        'join_date', p.created_at,
        'last_visit', p.last_check_in,
        'total_visits', p.total_check_ins,
        'member_state', p.member_state,
        'belt_color', p.belt_color,
        'monthly_payment', p.monthly_payment,
        'member_age_group', p.member_age_group,
        'member_parents', coalesce(p.member_parents, '[]'::jsonb),
        'date_of_birth', p.date_of_birth,
        'staff_flag_type', p.staff_flag_type,
        'staff_flag_other', p.staff_flag_other,
        'notes', coalesce(n.notes, '[]'::jsonb)
      ) order by p.created_at desc), '[]'::jsonb)
      from public.people p
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', mn.id,
            'body', mn.body,
            'created_at', mn.created_at
          )
          order by mn.created_at desc
        ) as notes
        from public.member_notes mn
        where mn.person_id = p.id
        limit 20
      ) n on true
      where p.status = 'member'
    );
  end if;

  if p_status = 'trial' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone', p.phone,
        'email', p.email,
        'trial_start_date', p.trial_start_date,
        'trial_end_date', p.trial_end_date,
        'days_remaining',
          ceil(extract(epoch from (p.trial_end_date - v_now)) / 86400)::int,
        'date_of_birth', p.date_of_birth,
        'notes', coalesce(n.notes, '[]'::jsonb)
      ) order by ceil(extract(epoch from (p.trial_end_date - v_now)) / 86400) asc), '[]'::jsonb)
      from public.people p
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', mn.id,
            'body', mn.body,
            'created_at', mn.created_at
          )
          order by mn.created_at desc
        ) as notes
        from public.member_notes mn
        where mn.person_id = p.id
        limit 20
      ) n on true
      where p.status = 'trial'
    );
  end if;

  if p_status = 'guest' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone', p.phone,
        'email', p.email,
        'created_at', p.created_at,
        'last_visit', p.last_check_in,
        'total_visits', p.total_check_ins,
        'completed_trial', coalesce(p.completed_trial, false),
        'date_of_birth', p.date_of_birth,
        'notes', coalesce(n.notes, '[]'::jsonb)
      ) order by p.created_at desc), '[]'::jsonb)
      from public.people p
      left join lateral (
        select jsonb_agg(
          jsonb_build_object(
            'id', mn.id,
            'body', mn.body,
            'created_at', mn.created_at
          )
          order by mn.created_at desc
        ) as notes
        from public.member_notes mn
        where mn.person_id = p.id
        limit 20
      ) n on true
      where p.status = 'guest'
    );
  end if;

  if p_status = 'professor' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'phone', p.phone,
        'email', p.email,
        'created_at', p.created_at
      ) order by p.created_at desc), '[]'::jsonb)
      from public.people p
      where p.status = 'professor'
    );
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'created_at', p.created_at,
      'contact_attempts', coalesce(la.contact_attempts, 0),
      'last_contact_date', la.last_contact_date
    ) order by p.created_at desc), '[]'::jsonb)
    from public.people p
    left join lateral (
      select count(*) as contact_attempts, max(l.contact_date) as last_contact_date
      from public.lead_activity l
      where l.person_id = p.id
    ) la on true
    where p.status = 'lead'
      and coalesce(p.lead_source, '') <> 'out_of_store'
  );
end;
$$;
