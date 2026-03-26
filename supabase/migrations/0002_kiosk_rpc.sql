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

