-- Run in Supabase SQL Editor to create/update Jack Wahl as an active member (kiosk test).
-- Phone must match what you type on the kiosk (digits only in DB).

insert into public.people (
  first_name,
  last_name,
  phone,
  email,
  status,
  member_state
)
values (
  'Jack',
  'Wahl',
  '7273891434',
  'jackwahl1023@aol.com',
  'member',
  'active'
)
on conflict (phone) do update set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  status = excluded.status,
  member_state = excluded.member_state;
