-- Staff: manually add a new member (skips trial / guest flow).

create or replace function public.mvp_create_member(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_monthly_payment numeric,
  p_belt_color text default null,
  p_member_age_group text default 'adult',
  p_date_of_birth date default null,
  p_member_parents jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_person public.people%rowtype;
  v_phone text;
  v_age_group text;
  v_parents jsonb;
  v_belt text;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_phone) < 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;

  if length(trim(coalesce(p_first_name, ''))) < 1 or length(trim(coalesce(p_last_name, ''))) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_name');
  end if;

  if length(trim(coalesce(p_email, ''))) < 3 or position('@' in trim(p_email)) < 2 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  if p_monthly_payment is null or p_monthly_payment <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_payment');
  end if;

  v_age_group := lower(trim(coalesce(p_member_age_group, 'adult')));
  if v_age_group not in ('adult', 'child') then
    return jsonb_build_object('ok', false, 'error', 'invalid_age_group');
  end if;

  v_parents := coalesce(p_member_parents, '[]'::jsonb);
  if jsonb_typeof(v_parents) <> 'array' then
    v_parents := '[]'::jsonb;
  end if;

  if v_age_group = 'child' and jsonb_array_length(v_parents) < 1 then
    return jsonb_build_object('ok', false, 'error', 'parent_required');
  end if;

  v_belt := nullif(trim(coalesce(p_belt_color, '')), '');

  if exists (select 1 from public.people where phone = v_phone) then
    return jsonb_build_object('ok', false, 'error', 'duplicate_phone');
  end if;

  insert into public.people (
    first_name,
    last_name,
    phone,
    email,
    status,
    member_state,
    belt_color,
    monthly_payment,
    member_age_group,
    date_of_birth,
    member_parents
  )
  values (
    trim(p_first_name),
    trim(p_last_name),
    v_phone,
    trim(p_email),
    'member',
    'active',
    v_belt,
    p_monthly_payment,
    v_age_group,
    p_date_of_birth,
    v_parents
  )
  returning * into v_person;

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
      'notes', '[]'::jsonb
    )
  );
end;
$$;
