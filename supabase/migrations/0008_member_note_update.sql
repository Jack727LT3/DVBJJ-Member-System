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
