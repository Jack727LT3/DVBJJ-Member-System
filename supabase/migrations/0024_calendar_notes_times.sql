-- Calendar notes + start times; trial overlays; auto start time on kiosk trial start.

alter table public.calendar_events
  add column if not exists start_time time;

create table if not exists public.calendar_trial_overlays (
  person_id uuid primary key references public.people (id) on delete cascade,
  note text,
  start_time time,
  updated_at timestamptz not null default now()
);

create or replace function public.mvp_calendar_events_list(
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
as $$
declare
  v_from date := coalesce(p_from, (current_date - interval '60 days')::date);
  v_to date := coalesce(p_to, (current_date + interval '120 days')::date);
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'kind', e.kind,
        'title', e.title,
        'notes', e.notes,
        'person_id', e.person_id,
        'person_first_name', p.first_name,
        'person_last_name', p.last_name,
        'person_phone', p.phone,
        'person_status', p.status,
        'start_date', e.start_date,
        'end_date', e.end_date,
        'start_time', e.start_time,
        'created_at', e.created_at
      )
      order by e.start_date asc, e.created_at asc
    )
    from public.calendar_events e
    left join public.people p on p.id = e.person_id
    where e.end_date >= v_from
      and e.start_date <= v_to
  ), '[]'::jsonb);
end;
$$;

create or replace function public.mvp_calendar_trial_overlays_list()
returns jsonb
language plpgsql
as $$
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'person_id', o.person_id,
        'note', o.note,
        'start_time', o.start_time,
        'updated_at', o.updated_at
      )
    )
    from public.calendar_trial_overlays o
  ), '[]'::jsonb);
end;
$$;

create or replace function public.mvp_calendar_event_create(
  p_kind text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_person_id uuid default null,
  p_notes text default null,
  p_start_time time default null
)
returns jsonb
language plpgsql
as $$
declare
  v_kind text := lower(trim(coalesce(p_kind, '')));
  v_title text := trim(coalesce(p_title, ''));
  v_event public.calendar_events%rowtype;
  v_person public.people%rowtype;
  v_end date;
begin
  if v_kind not in ('appointment', 'scheduled_trial') then
    return jsonb_build_object('ok', false, 'error', 'invalid_kind');
  end if;
  if length(v_title) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_title');
  end if;
  if p_start_date is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_start');
  end if;

  v_end := coalesce(p_end_date, p_start_date);
  if v_kind = 'scheduled_trial' then
    v_end := p_start_date + interval '6 days';
  end if;
  if v_end < p_start_date then
    return jsonb_build_object('ok', false, 'error', 'invalid_range');
  end if;

  if p_person_id is not null then
    select * into v_person from public.people where id = p_person_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'person_not_found');
    end if;
    if v_kind = 'scheduled_trial' and v_person.status not in ('guest', 'lead') then
      return jsonb_build_object('ok', false, 'error', 'person_not_eligible');
    end if;
    if length(v_title) < 1 then
      v_title := trim(v_person.first_name || ' ' || v_person.last_name);
    end if;
  end if;

  insert into public.calendar_events (kind, title, notes, person_id, start_date, end_date, start_time)
  values (
    v_kind,
    v_title,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_person_id,
    p_start_date,
    v_end,
    p_start_time
  )
  returning * into v_event;

  return jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'id', v_event.id,
      'kind', v_event.kind,
      'title', v_event.title,
      'notes', v_event.notes,
      'person_id', v_event.person_id,
      'person_first_name', v_person.first_name,
      'person_last_name', v_person.last_name,
      'person_phone', v_person.phone,
      'person_status', v_person.status,
      'start_date', v_event.start_date,
      'end_date', v_event.end_date,
      'start_time', v_event.start_time,
      'created_at', v_event.created_at
    )
  );
end;
$$;

create or replace function public.mvp_calendar_event_update(
  p_event_id uuid,
  p_notes text default null,
  p_start_time time default null,
  p_clear_start_time boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_event public.calendar_events%rowtype;
  v_person public.people%rowtype;
begin
  select * into v_event from public.calendar_events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.calendar_events
  set
    notes = case when p_notes is null then notes else nullif(trim(p_notes), '') end,
    start_time = case
      when p_clear_start_time then null
      when p_start_time is not null then p_start_time
      else start_time
    end
  where id = p_event_id
  returning * into v_event;

  if v_event.person_id is not null then
    select * into v_person from public.people where id = v_event.person_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'event', jsonb_build_object(
      'id', v_event.id,
      'kind', v_event.kind,
      'title', v_event.title,
      'notes', v_event.notes,
      'person_id', v_event.person_id,
      'person_first_name', v_person.first_name,
      'person_last_name', v_person.last_name,
      'person_phone', v_person.phone,
      'start_date', v_event.start_date,
      'end_date', v_event.end_date,
      'start_time', v_event.start_time,
      'created_at', v_event.created_at
    )
  );
end;
$$;

create or replace function public.mvp_calendar_trial_overlay_upsert(
  p_person_id uuid,
  p_note text default null,
  p_start_time time default null,
  p_clear_start_time boolean default false,
  p_set_note boolean default false
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.calendar_trial_overlays%rowtype;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_person');
  end if;

  insert into public.calendar_trial_overlays (person_id, note, start_time, updated_at)
  values (
    p_person_id,
    case when p_set_note then nullif(trim(coalesce(p_note, '')), '') else null end,
    case when p_clear_start_time then null else p_start_time end,
    now()
  )
  on conflict (person_id) do update
  set
    note = case
      when p_set_note then nullif(trim(coalesce(p_note, '')), '')
      else public.calendar_trial_overlays.note
    end,
    start_time = case
      when p_clear_start_time then null
      when p_start_time is not null then p_start_time
      else public.calendar_trial_overlays.start_time
    end,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'overlay', jsonb_build_object(
      'person_id', v_row.person_id,
      'note', v_row.note,
      'start_time', v_row.start_time,
      'updated_at', v_row.updated_at
    )
  );
end;
$$;

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
     and (v_person.total_check_ins = 0 or v_person.last_check_in is null) then
    update public.people
    set status = 'trial',
        trial_start_date = v_now,
        trial_end_date = v_now + interval '7 days',
        lead_source = null
    where id = p_person_id;
    v_person.status := 'trial';
    v_lead_first_visit := true;

    insert into public.calendar_trial_overlays (person_id, note, start_time, updated_at)
    values (p_person_id, null, (v_now at time zone 'America/New_York')::time, now())
    on conflict (person_id) do update
    set start_time = excluded.start_time, updated_at = now();
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

create or replace function public.mvp_calendar_activate_due_trials()
returns jsonb
language plpgsql
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select e.id as event_id, e.person_id, e.start_date, e.end_date, e.start_time
    from public.calendar_events e
    where e.kind = 'scheduled_trial'
      and e.start_date <= current_date
      and e.person_id is not null
  loop
    update public.people
    set
      status = 'trial',
      lead_source = null,
      trial_start_date = case
        when r.start_time is not null then (r.start_date + r.start_time) at time zone 'America/New_York'
        else r.start_date::timestamptz
      end,
      trial_end_date = (r.end_date::timestamptz + interval '1 day' - interval '1 second'),
      completed_trial = false
    where id = r.person_id
      and status in ('guest', 'lead');

    if found then
      insert into public.calendar_trial_overlays (person_id, note, start_time, updated_at)
      values (r.person_id, null, r.start_time, now())
      on conflict (person_id) do update
      set
        start_time = coalesce(public.calendar_trial_overlays.start_time, excluded.start_time),
        updated_at = now();

      delete from public.calendar_events where id = r.event_id;
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'activated', v_count);
end;
$$;
