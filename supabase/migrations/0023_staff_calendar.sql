-- Staff calendar: appointments + scheduled (future) trials for leads/guests.

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('appointment', 'scheduled_trial')),
  title text not null,
  notes text,
  person_id uuid references public.people (id) on delete set null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint calendar_events_dates_ok check (end_date >= start_date)
);

create index if not exists calendar_events_start_idx on public.calendar_events (start_date);
create index if not exists calendar_events_person_idx on public.calendar_events (person_id);

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
        'person_status', p.status,
        'start_date', e.start_date,
        'end_date', e.end_date,
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

create or replace function public.mvp_calendar_event_create(
  p_kind text,
  p_title text,
  p_start_date date,
  p_end_date date,
  p_person_id uuid default null,
  p_notes text default null
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

  insert into public.calendar_events (kind, title, notes, person_id, start_date, end_date)
  values (
    v_kind,
    v_title,
    nullif(trim(coalesce(p_notes, '')), ''),
    p_person_id,
    p_start_date,
    v_end
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
      'person_status', v_person.status,
      'start_date', v_event.start_date,
      'end_date', v_event.end_date,
      'created_at', v_event.created_at
    )
  );
end;
$$;

create or replace function public.mvp_calendar_event_delete(p_event_id uuid)
returns jsonb
language plpgsql
as $$
begin
  delete from public.calendar_events where id = p_event_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Activate scheduled trials whose start day has arrived (guest/lead → trial).
create or replace function public.mvp_calendar_activate_due_trials()
returns jsonb
language plpgsql
as $$
declare
  v_count int := 0;
  r record;
  v_now timestamptz := now();
begin
  for r in
    select e.id as event_id, e.person_id, e.start_date, e.end_date
    from public.calendar_events e
    where e.kind = 'scheduled_trial'
      and e.start_date <= current_date
      and e.person_id is not null
  loop
    update public.people
    set
      status = 'trial',
      lead_source = null,
      trial_start_date = r.start_date::timestamptz,
      trial_end_date = (r.end_date::timestamptz + interval '1 day' - interval '1 second'),
      completed_trial = false
    where id = r.person_id
      and status in ('guest', 'lead');

    if found then
      delete from public.calendar_events where id = r.event_id;
      v_count := v_count + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'activated', v_count);
end;
$$;
