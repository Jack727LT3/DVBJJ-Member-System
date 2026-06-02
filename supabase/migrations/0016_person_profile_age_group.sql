-- Allow staff to set adult/child on trial and guest profiles (not only members).
create or replace function public.mvp_update_person_profile(
  p_person_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_phone text default null,
  p_email text default null,
  p_date_of_birth date default null,
  p_member_age_group text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
begin
  update public.people
  set
    first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
    last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
    phone = coalesce(nullif(trim(p_phone), ''), phone),
    email = case when p_email is not null then nullif(trim(p_email), '') else email end,
    date_of_birth = coalesce(p_date_of_birth, date_of_birth),
    member_age_group = coalesce(
      case when p_member_age_group in ('adult', 'child') then p_member_age_group else null end,
      member_age_group
    )
  where id = p_person_id and status in ('trial', 'guest', 'lead')
  returning * into v_person;

  if v_person.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'person', jsonb_build_object(
      'id', v_person.id,
      'first_name', v_person.first_name,
      'last_name', v_person.last_name,
      'phone', v_person.phone,
      'email', v_person.email,
      'date_of_birth', v_person.date_of_birth,
      'member_age_group', v_person.member_age_group
    )
  );
end;
$$;
