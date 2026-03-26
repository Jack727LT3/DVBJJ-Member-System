-- 0004_admin_rpc.sql
-- RPC functions for admin dashboard lists + analytics.

create or replace function public.admin_expire_trials()
returns void
language sql
as $$
  update public.people
  set status = 'guest',
      member_state = null
  where status = 'trial'
    and trial_end_date is not null
    and trial_end_date <= now();
$$;

create or replace function public.admin_people_list(p_status people_status)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  -- Keep lists consistent with the "automatic conversion on access" rule.
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

  -- lead
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
  );
end;
$$;

create or replace function public.admin_analytics()
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
  v_total_check_ins_today int;
  v_peak_hour int;
  v_peak_hour_count int;
  v_inactive_members int;
  v_trials_expiring_soon int;
begin
  -- Keep analytics consistent with the "automatic conversion on access" rule.
  perform public.admin_expire_trials();

  v_start := date_trunc('day', v_now);
  v_end := v_start + interval '1 day';

  select count(*) into v_total_check_ins_today
  from public.check_ins ci
  where ci.timestamp >= v_start
    and ci.timestamp < v_end;

  select
    extract(hour from ci.timestamp)::int as peak_hour,
    count(*) as peak_hour_count
  into v_peak_hour, v_peak_hour_count
  from public.check_ins ci
  where ci.timestamp >= v_start
    and ci.timestamp < v_end
  group by extract(hour from ci.timestamp)
  order by peak_hour_count desc
  limit 1;

  -- "Inactive for 7+ days": never checked in, or last_check_in older than 7 days.
  select count(*) into v_inactive_members
  from public.people p
  where p.status = 'member'
    and (p.last_check_in is null or p.last_check_in <= v_now - interval '7 days');

  -- "Expiring soon": next 3 days (including today). Clamp at >= now in case of bad data.
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

