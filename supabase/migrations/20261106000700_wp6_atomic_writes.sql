-- WP6 (A-019, A-054): multi-step saves become one transaction each, so a failure half-way leaves
-- nothing changed instead of a half-saved state that the app reported as "Saved".

-- A new timetable: template, its slots, retiring the old one, and creating the classes, all or nothing.
-- Before, a failed slot insert still ran replace_timetable_from, which deleted the empty future classes.
create or replace function public.save_timetable(p_name text, p_from date, p_slots jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  t uuid;
  kept int;
  s jsonb;
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'bad_action' using errcode = 'P0001';
  end if;
  insert into public.timetable_templates (name, valid_from, valid_to, repeats)
  values (coalesce(nullif(trim(p_name), ''), 'Timetable from ' || p_from), p_from, p_from + 62, true)
  returning id into t;
  for s in select * from jsonb_array_elements(p_slots) loop
    if not exists (select 1 from public.class_types where id = (s->>'class_type_id')::uuid) then
      raise exception 'unknown_class_type' using errcode = 'P0001';
    end if;
    insert into public.template_slots (template_id, weekday, start_time, class_type_id, capacity)
    values (t, (s->>'weekday')::smallint, (s->>'time')::time, (s->>'class_type_id')::uuid, nullif(s->>'capacity', '')::int)
    on conflict do nothing;
  end loop;
  kept := public.replace_timetable_from(t);
  perform public.generate_sessions(t);
  perform public.extend_timetable();
  return kept;
end $$;
revoke all on function public.save_timetable(text, date, jsonb) from public, anon, authenticated;
grant execute on function public.save_timetable(text, date, jsonb) to service_role;

-- First details + the consents she needs, together (sign-up confirmation and /welcome).
-- Before, the profile could be marked onboarded while the consent rows failed to save.
create or replace function public.onboard_profile(
  p_profile uuid, p_first text, p_last text, p_full text, p_phone text, p_dob date, p_email text,
  p_photo text, p_marketing boolean, p_version text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set first_name = p_first, last_name = p_last, full_name = p_full, phone = p_phone,
         date_of_birth = p_dob, email = lower(p_email), photo_consent = p_photo, marketing_email = p_marketing,
         marketing_sms = false, onboarded_at = now()
   where id = p_profile and deleted_at is null;
  if not found then raise exception 'profile_not_found' using errcode = 'P0001'; end if;
  insert into public.consents (profile_id, type, granted, version) values
    (p_profile, 'policy', true, p_version),
    (p_profile, 'terms', true, p_version),
    (p_profile, 'fitness_declaration', true, p_version),
    (p_profile, 'marketing_email', p_marketing, p_version);
  if p_photo is not null then
    insert into public.consents (profile_id, type, granted, version) values (p_profile, 'photos', p_photo <> 'none', p_version || ':' || p_photo);
  end if;
end $$;
revoke all on function public.onboard_profile(uuid, text, text, text, text, date, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.onboard_profile(uuid, text, text, text, text, date, text, text, boolean, text) to service_role;

-- Weekly rules: turning the old ones off and saving the new ones happen together, so a failed insert
-- can't leave the client with no weekly rules at all.
create or replace function public.replace_recurring_rules(p_profile uuid, p_slots jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  s jsonb;
begin
  update public.recurring_rules set active = false where profile_id = p_profile and active;
  for s in select * from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) loop
    insert into public.recurring_rules (profile_id, class_type_id, weekday, start_time)
    values (p_profile, (s->>'class_type_id')::uuid, (s->>'weekday')::smallint, (s->>'time')::time)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.replace_recurring_rules(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_recurring_rules(uuid, jsonb) to service_role;
