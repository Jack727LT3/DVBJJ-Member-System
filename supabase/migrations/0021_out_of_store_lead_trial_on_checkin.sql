-- Out-of-store leads start their 7-day trial on first kiosk check-in
-- (after the frontend has collected profile + waiver).

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

  -- Any lead (including out_of_store) starts trial on first visit.
  -- Plain guests do not — those stay guests until staff enrolls or they pick trial signup.
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
