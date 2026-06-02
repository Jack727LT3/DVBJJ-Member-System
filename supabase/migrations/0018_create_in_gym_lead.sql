-- Staff-created in-gym lead (kiosk-style, not out-of-store).
create or replace function public.mvp_create_in_gym_lead(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null
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

  if found and coalesce(v_existing.lead_source, '') = 'out_of_store' then
    return jsonb_build_object('ok', false, 'error', 'out_of_store_lead');
  end if;

  if found then
    update public.people
    set
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
      lead_source = null
    where id = v_existing.id
    returning * into v_person;
  else
    insert into public.people (first_name, last_name, phone, email, status, lead_source)
    values (
      trim(p_first_name),
      trim(p_last_name),
      p_phone,
      nullif(trim(coalesce(p_email, '')), ''),
      'lead',
      null
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
      'created_at', v_person.created_at
    )
  );
end;
$$;
