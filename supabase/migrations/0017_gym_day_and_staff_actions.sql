-- "Today" uses gym local calendar day (Florida / Eastern).
create or replace function public.admin_analytics()
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_gym_date date := (v_now at time zone 'America/New_York')::date;
  v_total_check_ins_today int;
  v_peak_hour int;
  v_peak_hour_count int;
  v_inactive_members int;
  v_trials_expiring_soon int;
begin
  perform public.admin_expire_trials();

  select count(*) into v_total_check_ins_today
  from public.check_ins ci
  where (ci.timestamp at time zone 'America/New_York')::date = v_gym_date;

  select
    extract(hour from (ci.timestamp at time zone 'America/New_York'))::int as peak_hour,
    count(*) as peak_hour_count
  into v_peak_hour, v_peak_hour_count
  from public.check_ins ci
  where (ci.timestamp at time zone 'America/New_York')::date = v_gym_date
  group by extract(hour from (ci.timestamp at time zone 'America/New_York'))
  order by peak_hour_count desc
  limit 1;

  select count(*) into v_inactive_members
  from public.people p
  where p.status = 'member'
    and (p.last_check_in is null or p.last_check_in <= v_now - interval '7 days');

  select count(*) into v_trials_expiring_soon
  from public.people p
  where p.status = 'trial'
    and p.trial_end_date is not null
    and p.trial_end_date >= v_now
    and p.trial_end_date <= v_now + interval '3 days';

  return jsonb_build_object(
    'total_check_ins_today', coalesce(v_total_check_ins_today, 0),
    'peak_hour', v_peak_hour,
    'peak_hour_count', coalesce(v_peak_hour_count, 0),
    'inactive_members_7plus_days', coalesce(v_inactive_members, 0),
    'trials_expiring_soon_3_days', coalesce(v_trials_expiring_soon, 0)
  );
end;
$$;

-- Move expired trials to guests (trial completed) when staff loads dashboard data.
create or replace function public.admin_expire_trials()
returns void
language plpgsql
as $$
begin
  update public.people
  set
    status = 'guest',
    member_state = null,
    trial_start_date = null,
    trial_end_date = null,
    completed_trial = true,
    belt_color = null,
    monthly_payment = null
  where status = 'trial'
    and trial_end_date is not null
    and trial_end_date < now();
end;
$$;

-- Active (or canceled) member -> guest in one step.
create or replace function public.mvp_cancel_membership_to_guest(p_person_id uuid)
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
  where id = p_person_id and status = 'member'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
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
      'member_age_group', v_person.member_age_group,
      'completed_trial', coalesce(v_person.completed_trial, false)
    )
  );
end;
$$;

-- Remove a mistaken check-in and refresh visit totals.
create or replace function public.mvp_delete_check_in(
  p_person_id uuid,
  p_check_in_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_deleted int;
  v_person public.people%rowtype;
  v_last timestamptz;
  v_total int;
begin
  delete from public.check_ins
  where id = p_check_in_id and person_id = p_person_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select max(timestamp) into v_last
  from public.check_ins
  where person_id = p_person_id;

  select count(*)::int into v_total
  from public.check_ins
  where person_id = p_person_id;

  update public.people
  set last_check_in = v_last, total_check_ins = v_total
  where id = p_person_id
  returning * into v_person;

  return jsonb_build_object(
    'ok', true,
    'last_visit', v_person.last_check_in,
    'total_visits', v_person.total_check_ins
  );
end;
$$;
