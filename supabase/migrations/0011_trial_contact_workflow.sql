-- Trial contact workflow: keep expired trials visible until staff marks contacted.

alter table public.people
  add column if not exists completed_trial boolean not null default false;

-- Staff dashboard lists trials manually; kiosk still expires on check-in.
create or replace function public.admin_expire_trials()
returns void
language plpgsql
as $$
begin
  return;
end;
$$;

create or replace function public.mvp_add_person_note(
  p_person_id uuid,
  p_body text
)
returns jsonb
language plpgsql
as $$
declare
  v_note public.member_notes%rowtype;
begin
  if length(trim(coalesce(p_body, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'empty_note');
  end if;

  if not exists (
    select 1 from public.people
    where id = p_person_id and status in ('member', 'trial', 'guest')
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.member_notes (person_id, body)
  values (p_person_id, trim(p_body))
  returning * into v_note;

  return jsonb_build_object(
    'ok', true,
    'note', jsonb_build_object(
      'id', v_note.id,
      'body', v_note.body,
      'created_at', v_note.created_at
    )
  );
end;
$$;

create or replace function public.mvp_update_person_note(
  p_person_id uuid,
  p_note_id uuid,
  p_body text
)
returns jsonb
language plpgsql
as $$
declare
  v_note public.member_notes%rowtype;
begin
  if length(trim(coalesce(p_body, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'empty_note');
  end if;

  update public.member_notes
  set body = trim(p_body)
  where id = p_note_id and person_id = p_person_id
  returning * into v_note;

  if v_note.id is null then
    return jsonb_build_object('ok', false, 'error', 'note_not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'note', jsonb_build_object(
      'id', v_note.id,
      'body', v_note.body,
      'created_at', v_note.created_at
    )
  );
end;
$$;

create or replace function public.mvp_complete_trial_contact(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set
    status = 'guest',
    completed_trial = true,
    member_state = null
  where id = p_person_id and status = 'trial'
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'guest', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'created_at', v_person.created_at,
      'last_visit', v_person.last_check_in,
      'completed_trial', true
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
        'created_at', p.created_at,
        'last_visit', p.last_check_in,
        'completed_trial', coalesce(p.completed_trial, false)
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
