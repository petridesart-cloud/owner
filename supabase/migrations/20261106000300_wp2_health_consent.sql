-- WP2 (A-001, A-105): health data is a real choice, can be withdrawn, and only the instructor sees it.
--
-- profiles.health_mode: how the client answered the health questions
--   'answers'   answers stored with explicit consent
--   'none'      "No injuries or medical conditions" (nothing stored)
--   'in_person' they'd rather tell the instructor in person, or they withdrew consent (nothing stored)
-- profiles.can_view_health: studio-team members who may read health answers (the instructor).
-- Other admins see only the "Doctor's note needed" and "Health: tell in person" flags.

alter table public.profiles add column if not exists health_mode text
  check (health_mode in ('answers', 'none', 'in_person'));
alter table public.profiles add column if not exists can_view_health boolean not null default false;

update public.profiles p set health_mode = 'answers'
  where health_mode is null and exists (select 1 from public.health_notes h where h.profile_id = p.id);
update public.profiles set health_mode = 'none'
  where health_mode is null and parq_completed_at is not null;

-- Proposed default (owner to confirm, docs/AUDIT.md "Open after Phase 4"): the instructor only.
-- Other viewers are granted with HEALTH_VIEWER_EMAILS (app bootstrap) or by the owner in SQL.
update public.profiles set can_view_health = true
  where email = 'elysia.stephani@gmail.com' and role = 'admin' and deleted_at is null;

create or replace function public.can_view_health() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin' and can_view_health and deleted_at is null)
$$;
revoke all on function public.can_view_health() from public, anon;
grant execute on function public.can_view_health() to authenticated, service_role;

drop policy if exists "health read owner or instructor" on public.health_notes;
drop policy if exists "health instructor write" on public.health_notes;
create policy "health read owner or instructor" on public.health_notes for select to authenticated
  using (profile_id = public.my_profile_id() or public.can_view_health());
create policy "health instructor write" on public.health_notes for all to authenticated
  using (public.can_view_health()) with check (public.can_view_health());

-- Is there a health-data consent standing for this profile (latest row granted, this version)?
create or replace function public.health_consent_standing(p_profile uuid, p_version text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select c.granted and c.version is not distinct from p_version from public.consents c
    where c.profile_id = p_profile and c.type = 'health_data' order by c.created_at desc, c.id desc limit 1), false)
$$;

-- Remove every stored health answer (notes and the whole history) and record the withdrawal
-- when a consent was standing. Returns true if anything was removed or withdrawn.
create or replace function public.clear_health_data(p_profile uuid, p_version text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  removed int := 0;
  n int;
  last_granted boolean;
begin
  delete from public.health_notes where profile_id = p_profile;
  get diagnostics n = row_count; removed := removed + n;
  delete from public.health_history where profile_id = p_profile;
  get diagnostics n = row_count; removed := removed + n;
  select c.granted into last_granted from public.consents c
    where c.profile_id = p_profile and c.type = 'health_data' order by c.created_at desc, c.id desc limit 1;
  if coalesce(last_granted, false) then
    insert into public.consents (profile_id, type, granted, version) values (p_profile, 'health_data', false, p_version);
    removed := removed + 1;
  end if;
  return removed > 0;
end $$;

-- Save the health questions in one transaction; parq_completed_at is set last (A-019).
-- p_mode: 'answers' (p_answers stored, needs consent), 'none' or 'in_person' (nothing stored,
-- earlier answers and history removed, consent withdrawn if it stood).
create or replace function public.save_health_answers(p_profile uuid, p_mode text, p_answers jsonb, p_consent boolean, p_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  a jsonb := coalesce(p_answers, '{}'::jsonb);
  standing boolean;
  clearance boolean := coalesce((a->>'clearance_needed')::boolean, false);
  prev_received date;
  conds text[] := coalesce(array(select jsonb_array_elements_text(coalesce(a->'conditions', '[]'::jsonb))), '{}');
  removed boolean := false;
begin
  if p_mode not in ('answers', 'none', 'in_person') then raise exception 'invalid_health_mode'; end if;
  perform 1 from public.profiles where id = p_profile and deleted_at is null for update;
  if not found then raise exception 'profile_not_found'; end if;

  if p_mode = 'answers' then
    standing := public.health_consent_standing(p_profile, p_version);
    if not (coalesce(p_consent, false) or standing) then raise exception 'health_consent_required'; end if;
    select clearance_received_at into prev_received from public.health_notes where profile_id = p_profile;
    insert into public.health_notes as h (profile_id, conditions, details, pregnancy, pregnancy_weeks, postpartum_months,
      bp_meds, medication, clearance_needed, clearance_received_at, note, injuries, parq_yes, consent_at, updated_at)
    values (p_profile, conds, a->>'details', a->>'pregnancy', (a->>'pregnancy_weeks')::int, (a->>'postpartum_months')::int,
      coalesce((a->>'bp_meds')::boolean, false), a->>'medication', clearance, case when clearance then prev_received end,
      null, null, null, now(), now())
    on conflict (profile_id) do update set conditions = excluded.conditions, details = excluded.details,
      pregnancy = excluded.pregnancy, pregnancy_weeks = excluded.pregnancy_weeks, postpartum_months = excluded.postpartum_months,
      bp_meds = excluded.bp_meds, medication = excluded.medication, clearance_needed = excluded.clearance_needed,
      clearance_received_at = excluded.clearance_received_at, note = null, injuries = null, parq_yes = null,
      consent_at = case when standing then h.consent_at else now() end, updated_at = now();
    if not standing then
      insert into public.consents (profile_id, type, granted, version) values (p_profile, 'health_data', true, p_version);
    end if;
    insert into public.health_history (profile_id, conditions, details, pregnancy, pregnancy_weeks, postpartum_months, bp_meds, medication, clearance_needed)
    values (p_profile, conds, a->>'details', a->>'pregnancy', (a->>'pregnancy_weeks')::int, (a->>'postpartum_months')::int,
      coalesce((a->>'bp_meds')::boolean, false), a->>'medication', clearance);
  else
    removed := public.clear_health_data(p_profile, p_version);
    clearance := false;
    if p_mode = 'in_person' then
      insert into public.consents (profile_id, type, granted, version) values (p_profile, 'health_declaration_offline', true, p_version);
    end if;
  end if;

  update public.profiles set health_mode = p_mode, parq_completed_at = now() where id = p_profile;
  return jsonb_build_object('clearance', clearance, 'removed', removed);
end $$;

-- Account → Health → "Delete my health information": everything goes, the questions stay answered
-- ("tell in person"), so booking still works.
create or replace function public.withdraw_health_consent(p_profile uuid, p_version text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  removed boolean;
begin
  perform 1 from public.profiles where id = p_profile and deleted_at is null for update;
  if not found then raise exception 'profile_not_found'; end if;
  removed := public.clear_health_data(p_profile, p_version);
  update public.profiles set health_mode = 'in_person' where id = p_profile and parq_completed_at is not null;
  return removed;
end $$;

revoke all on function public.health_consent_standing(uuid, text), public.clear_health_data(uuid, text),
  public.save_health_answers(uuid, text, jsonb, boolean, text), public.withdraw_health_consent(uuid, text)
  from public, anon, authenticated;
grant execute on function public.health_consent_standing(uuid, text), public.clear_health_data(uuid, text),
  public.save_health_answers(uuid, text, jsonb, boolean, text), public.withdraw_health_consent(uuid, text)
  to service_role;
