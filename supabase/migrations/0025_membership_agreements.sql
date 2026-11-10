-- Membership plan agreements signed at the kiosk (stored on person profile).

create table if not exists public.membership_agreements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  signed_at timestamptz not null default now(),
  plan_id text not null,
  plan_label text not null,
  participant_name text not null,
  participant_signature text not null,
  financial_responsible_name text,
  financial_responsible_signature text,
  agreement_version text not null default '1'
);

create index if not exists membership_agreements_person_id_idx
  on public.membership_agreements (person_id, signed_at desc);

alter table public.membership_agreements enable row level security;

drop policy if exists "membership_agreements_deny_all" on public.membership_agreements;
create policy "membership_agreements_deny_all" on public.membership_agreements
  for all using (false) with check (false);

create or replace function public.kiosk_save_membership_agreement(
  p_person_id uuid,
  p_plan_id text,
  p_plan_label text,
  p_participant_name text,
  p_participant_signature text,
  p_financial_responsible_name text default null,
  p_financial_responsible_signature text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_row public.membership_agreements%rowtype;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_person');
  end if;
  if not exists (select 1 from public.people where id = p_person_id) then
    return jsonb_build_object('ok', false, 'error', 'person_not_found');
  end if;
  if length(trim(coalesce(p_plan_id, ''))) < 1
     or length(trim(coalesce(p_plan_label, ''))) < 1
     or length(trim(coalesce(p_participant_name, ''))) < 1
     or length(coalesce(p_participant_signature, '')) < 10 then
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  insert into public.membership_agreements (
    person_id,
    plan_id,
    plan_label,
    participant_name,
    participant_signature,
    financial_responsible_name,
    financial_responsible_signature
  )
  values (
    p_person_id,
    trim(p_plan_id),
    trim(p_plan_label),
    trim(p_participant_name),
    p_participant_signature,
    nullif(trim(coalesce(p_financial_responsible_name, '')), ''),
    nullif(p_financial_responsible_signature, '')
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'agreement', jsonb_build_object(
      'id', v_row.id,
      'person_id', v_row.person_id,
      'signed_at', v_row.signed_at,
      'plan_id', v_row.plan_id,
      'plan_label', v_row.plan_label,
      'participant_name', v_row.participant_name,
      'participant_signature', v_row.participant_signature,
      'financial_responsible_name', v_row.financial_responsible_name,
      'financial_responsible_signature', v_row.financial_responsible_signature,
      'agreement_version', v_row.agreement_version
    )
  );
end;
$$;

create or replace function public.mvp_list_membership_agreements(p_person_id uuid)
returns jsonb
language plpgsql
as $$
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'signed_at', a.signed_at,
        'plan_id', a.plan_id,
        'plan_label', a.plan_label,
        'participant_name', a.participant_name,
        'participant_signature', a.participant_signature,
        'financial_responsible_name', a.financial_responsible_name,
        'financial_responsible_signature', a.financial_responsible_signature,
        'agreement_version', a.agreement_version
      )
      order by a.signed_at desc
    )
    from public.membership_agreements a
    where a.person_id = p_person_id
  ), '[]'::jsonb);
end;
$$;
