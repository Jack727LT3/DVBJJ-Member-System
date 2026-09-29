-- Staff can manually set a trial end date (extend or shorten).

create or replace function public.mvp_extend_trial(
  p_person_id uuid,
  p_trial_end_date timestamptz
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_now timestamptz := now();
begin
  if p_trial_end_date is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_date');
  end if;

  select * into v_person from public.people where id = p_person_id and status = 'trial';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_trial');
  end if;

  update public.people
  set
    trial_end_date = p_trial_end_date,
    trial_start_date = coalesce(trial_start_date, v_now),
    completed_trial = false
  where id = p_person_id
  returning * into v_person;

  return jsonb_build_object(
    'ok', true,
    'trial', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'trial_start_date', v_person.trial_start_date,
      'trial_end_date', v_person.trial_end_date,
      'days_remaining', ceil(extract(epoch from (v_person.trial_end_date - v_now)) / 86400)::int,
      'date_of_birth', v_person.date_of_birth
    )
  );
end;
$$;
