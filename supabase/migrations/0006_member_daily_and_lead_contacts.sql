-- Member daily upkeep: belts, payments, dated notes.
-- Out-of-store lead contact history.

alter table public.people
  add column if not exists belt_color text,
  add column if not exists monthly_payment numeric(10, 2);

create table if not exists public.member_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists member_notes_person_created_idx
  on public.member_notes (person_id, created_at desc);

alter table public.member_notes enable row level security;

drop policy if exists "member_notes_deny_all" on public.member_notes;
create policy "member_notes_deny_all" on public.member_notes
  for all using (false) with check (false);

-- Log a contact attempt (call / text / email) for an out-of-store lead.
create or replace function public.mvp_log_out_of_store_contact(
  p_person_id uuid,
  p_contact_type text,
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  if p_contact_type not in ('call', 'text', 'email') then
    return jsonb_build_object('ok', false, 'error', 'invalid_contact_type');
  end if;

  select * into v_person
  from public.people
  where id = p_person_id
    and status = 'lead'
    and lead_source = 'out_of_store';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.lead_activity (person_id, contact_type, notes)
  values (p_person_id, p_contact_type, nullif(trim(coalesce(p_notes, '')), ''));

  update public.people
  set lead_contacted_at = now()
  where id = p_person_id;

  return public.mvp_out_of_store_lead_row(p_person_id);
end;
$$;

-- Single lead payload helper.
create or replace function public.mvp_out_of_store_lead_row(p_person_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'phone', p.phone,
      'email', p.email,
      'created_at', p.created_at,
      'lead_inquiry_source', p.lead_inquiry_source,
      'lead_notes', p.lead_notes,
      'lead_contacted_at', p.lead_contacted_at,
      'contacted', (p.lead_contacted_at is not null),
      'contact_attempts', coalesce(la.cnt, 0),
      'contacts', coalesce(la.history, '[]'::jsonb)
    )
  )
  from public.people p
  left join lateral (
    select
      count(*)::int as cnt,
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'at', l.contact_date,
          'contact_type', l.contact_type,
          'notes', l.notes
        )
        order by l.contact_date desc
      ) as history
    from public.lead_activity l
    where l.person_id = p.id
  ) la on true
  where p.id = p_person_id;
$$;

create or replace function public.mvp_out_of_store_leads_list()
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'phone', p.phone,
    'email', p.email,
    'created_at', p.created_at,
    'lead_inquiry_source', p.lead_inquiry_source,
    'lead_notes', p.lead_notes,
    'lead_contacted_at', p.lead_contacted_at,
    'contacted', (p.lead_contacted_at is not null),
    'contact_attempts', coalesce(la.cnt, 0),
    'contacts', coalesce(la.history, '[]'::jsonb)
  ) order by (p.lead_contacted_at is null) desc, p.created_at desc), '[]'::jsonb)
  from public.people p
  left join lateral (
    select
      count(*)::int as cnt,
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'at', l.contact_date,
          'contact_type', l.contact_type,
          'notes', l.notes
        )
        order by l.contact_date desc
      ) as history
    from public.lead_activity l
    where l.person_id = p.id
  ) la on true
  where p.status = 'lead'
    and p.lead_source = 'out_of_store';
$$;

create or replace function public.mvp_set_out_of_store_lead_contacted(
  p_person_id uuid,
  p_contacted boolean
)
returns jsonb
language plpgsql
as $$
begin
  update public.people
  set lead_contacted_at = case when p_contacted then coalesce(lead_contacted_at, now()) else null end
  where id = p_person_id
    and status = 'lead'
    and lead_source = 'out_of_store';

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return public.mvp_out_of_store_lead_row(p_person_id);
end;
$$;

create or replace function public.mvp_add_member_note(
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
    where id = p_person_id and status = 'member'
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

-- Members list includes belt, payment, and recent notes for daily tab.
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
        'join_date', p.created_at,
        'last_visit', p.last_check_in,
        'total_visits', p.total_check_ins,
        'member_state', p.member_state,
        'belt_color', p.belt_color,
        'monthly_payment', p.monthly_payment,
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
        'trial_end_date', p.trial_end_date,
        'days_remaining',
          greatest(0, ceil(extract(epoch from (p.trial_end_date - v_now)) / 86400))::int
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
