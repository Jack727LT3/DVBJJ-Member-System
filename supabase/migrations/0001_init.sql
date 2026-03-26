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

