-- Guest enrollment: rich guest list + promote guest to member.

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

  update public.people
  set
    status = 'member',
    member_state = 'active',
    belt_color = trim(p_belt_color),
    monthly_payment = p_monthly_payment,
    member_age_group = v_age_group,
    date_of_birth = p_date_of_birth,
    member_parents = v_parents
  where id = p_person_id and status = 'guest'
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
        'completed_trial', coalesce(p.completed_trial, false),
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
