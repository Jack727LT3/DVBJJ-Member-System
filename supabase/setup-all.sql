-- ========== 0001_init.sql ==========
-- 0001_init.sql
-- MVP schema for kiosk check-ins + member lifecycle tracking.
-- Apply this SQL in Supabase (SQL Editor or via your migration workflow).

-- Extensions used by the schema.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'people_status') then
    create type people_status as enum ('lead', 'trial', 'guest', 'member');
  end if;
  if not exists (select 1 from pg_type where typname = 'member_state') then
    create type member_state as enum ('active', 'delinquent', 'frozen', 'canceled');
  end if;
end
$$;

-- people
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  -- Store canonical digits-only phone (enforced by application normalization).
  phone text not null unique,
  email text,
  status people_status not null,
  member_state member_state,
  created_at timestamptz not null default now(),
  trial_start_date timestamptz,
  trial_end_date timestamptz,
  last_check_in timestamptz,
  total_check_ins integer not null default 0,
  -- Basic sanity: trial dates should exist when status=trial.
  constraint people_trial_dates_required check (
    (status <> 'trial')
    or (trial_start_date is not null and trial_end_date is not null)
  )
);

-- check_ins
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  timestamp timestamptz not null default now()
);

-- lead_activity
create table if not exists public.lead_activity (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  contact_date timestamptz not null default now(),
  contact_type text not null,
  notes text,
  constraint lead_activity_contact_type_required check (
    contact_type in ('call', 'text', 'email')
  )
);

-- Indexes for kiosk search + admin filtering/analytics
create index if not exists people_status_idx on public.people(status);
create index if not exists people_last_check_in_idx on public.people(last_check_in);
create index if not exists people_phone_idx on public.people(phone);

-- Name indexes (case-insensitive)
create index if not exists people_first_name_lc_idx on public.people (lower(first_name));
create index if not exists people_last_name_lc_idx on public.people (lower(last_name));

-- Trigram indexes to support fast substring matches in kiosk search.
create index if not exists people_first_name_trgm_idx on public.people
  using gin (lower(first_name) gin_trgm_ops);
create index if not exists people_last_name_trgm_idx on public.people
  using gin (lower(last_name) gin_trgm_ops);

-- check_ins indexes
create index if not exists check_ins_person_id_idx on public.check_ins(person_id);
create index if not exists check_ins_timestamp_idx on public.check_ins(timestamp);

-- lead_activity indexes
create index if not exists lead_activity_person_contact_date_idx
  on public.lead_activity(person_id, contact_date desc);

-- Security defaults: since all reads/writes happen through our Next.js server with the
-- Supabase service role, we deny direct client-side access by default.
alter table public.people enable row level security;
alter table public.check_ins enable row level security;
alter table public.lead_activity enable row level security;

drop policy if exists "people_deny_all" on public.people;
create policy "people_deny_all" on public.people
  for all
  using (false)
  with check (false);

drop policy if exists "check_ins_deny_all" on public.check_ins;
create policy "check_ins_deny_all" on public.check_ins
  for all
  using (false)
  with check (false);

drop policy if exists "lead_activity_deny_all" on public.lead_activity;
create policy "lead_activity_deny_all" on public.lead_activity
  for all
  using (false)
  with check (false);


-- ========== 0002_kiosk_rpc.sql ==========
-- 0002_kiosk_rpc.sql
-- RPCs used by the kiosk to perform check-ins atomically.

create or replace function public.kiosk_check_in(p_person_id uuid)
returns jsonb
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_person public.people%rowtype;
  v_lead_first_visit boolean := false;
begin
  -- Lock the row so lead->trial conversion and check-in increment are concurrency-safe.
  select * into v_person
  from public.people
  where id = p_person_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Automatic trial expiration on access.
  if v_person.status = 'trial' and v_person.trial_end_date is not null and v_person.trial_end_date <= v_now then
    update public.people
    set status = 'guest',
        member_state = null
    where id = p_person_id;

    v_person.status := 'guest';
    v_person.member_state := null;
  end if;

  -- Lead-first-check-in converts to trial (only on first touch).
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

  -- Log the check-in.
  insert into public.check_ins (person_id, timestamp)
  values (p_person_id, v_now);

  -- Update counters + last_check_in.
  update public.people
  set last_check_in = v_now,
      total_check_ins = total_check_ins + 1
  where id = p_person_id;

  -- Reload for accurate response payload.
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
  p_email text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person_id uuid;
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
    p_first_name,
    p_last_name,
    p_phone,
    p_email,
    'guest',
    null
  )
  on conflict (phone) do update
  set first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = coalesce(excluded.email, public.people.email)
  returning public.people.id into v_person_id;

  return public.kiosk_check_in(v_person_id);
end;
$$;


-- ========== 0003_search_indexes.sql ==========
-- 0003_search_indexes.sql
-- Extra kiosk-search indexes to better support Supabase PostgREST filters
-- (which typically target raw columns, not lower(column) expressions).

create extension if not exists pg_trgm;

create index if not exists people_first_name_trgm_raw_idx on public.people
  using gin (first_name gin_trgm_ops);

create index if not exists people_last_name_trgm_raw_idx on public.people
  using gin (last_name gin_trgm_ops);


-- ========== 0004_admin_rpc.sql ==========
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


-- ========== 0005_out_of_store_leads.sql ==========
-- Out-of-store leads: website, phone, online signups — not yet visited the gym.

alter table public.people
  add column if not exists lead_source text,
  add column if not exists lead_contacted_at timestamptz,
  add column if not exists lead_notes text,
  add column if not exists lead_inquiry_source text;

create index if not exists people_lead_source_idx
  on public.people (lead_source)
  where status = 'lead';

-- List out-of-store leads for staff MVP.
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
    'contacted', (p.lead_contacted_at is not null)
  ) order by
    (p.lead_contacted_at is null) desc,
    p.created_at desc
  ), '[]'::jsonb)
  from public.people p
  where p.status = 'lead'
    and p.lead_source = 'out_of_store';
$$;

-- Create a manual out-of-store lead (no check-in).
create or replace function public.mvp_create_out_of_store_lead(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_inquiry_source text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_existing public.people%rowtype;
begin
  select * into v_existing from public.people where phone = p_phone;

  if found and v_existing.status <> 'lead' then
    return jsonb_build_object('ok', false, 'error', 'phone_in_use');
  end if;

  if found then
    update public.people
    set
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      lead_source = 'out_of_store',
      lead_inquiry_source = coalesce(nullif(trim(coalesce(p_inquiry_source, '')), ''), lead_inquiry_source),
      lead_notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), lead_notes)
    where id = v_existing.id
    returning * into v_person;
  else
    insert into public.people (
      first_name,
      last_name,
      phone,
      email,
      status,
      lead_source,
      lead_inquiry_source,
      lead_notes
    )
    values (
      trim(p_first_name),
      trim(p_last_name),
      p_phone,
      nullif(trim(coalesce(p_email, '')), ''),
      'lead',
      'out_of_store',
      nullif(trim(coalesce(p_inquiry_source, '')), ''),
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning * into v_person;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'created_at', v_person.created_at,
      'lead_inquiry_source', v_person.lead_inquiry_source,
      'lead_notes', v_person.lead_notes,
      'lead_contacted_at', v_person.lead_contacted_at,
      'contacted', (v_person.lead_contacted_at is not null)
    )
  );
end;
$$;

-- Mark contacted / not contacted.
create or replace function public.mvp_set_out_of_store_lead_contacted(
  p_person_id uuid,
  p_contacted boolean
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set lead_contacted_at = case when p_contacted then now() else null end
  where id = p_person_id
    and status = 'lead'
    and lead_source = 'out_of_store'
  returning * into v_person;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_contacted then
    insert into public.lead_activity (person_id, contact_type, notes)
    values (p_person_id, 'call', 'Marked contacted from staff dashboard');
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'created_at', v_person.created_at,
      'lead_inquiry_source', v_person.lead_inquiry_source,
      'lead_notes', v_person.lead_notes,
      'lead_contacted_at', v_person.lead_contacted_at,
      'contacted', (v_person.lead_contacted_at is not null)
    )
  );
end;
$$;

-- Overview "Leads" list: in-store / kiosk leads only (not out-of-store).
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
      and coalesce(p.lead_source, '') <> 'out_of_store'
  );
end;
$$;

-- ========== 0006_member_daily_and_lead_contacts.sql ==========
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

-- ========== 0007_member_phone_email.sql ==========
-- Include phone and email on member list for staff search.

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

-- ========== 0008_member_note_update.sql ==========
-- Update existing member notes from staff profile.

create or replace function public.mvp_update_member_note(
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

  if not exists (
    select 1 from public.people
    where id = p_person_id and status = 'member'
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
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

-- ========== 0009_member_age_group_parents.sql ==========
-- Child vs adult members and parent/guardian contact info for minors.

alter table public.people
  add column if not exists member_age_group text not null default 'adult'
    check (member_age_group in ('adult', 'child')),
  add column if not exists member_parents jsonb not null default '[]'::jsonb;

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

-- ========== 0010_member_date_of_birth.sql ==========
-- Member date of birth for age on staff profiles.

alter table public.people
  add column if not exists date_of_birth date;

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

-- ========== 0011_trial_contact_workflow.sql ==========
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

-- ========== 0012_guest_enroll.sql ==========
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

