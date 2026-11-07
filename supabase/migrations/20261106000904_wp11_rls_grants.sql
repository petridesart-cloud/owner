-- WP11 (A-041, A-086): what the public anon key (signed out, or with a client's JWT) can reach directly.
-- The app reads and writes only with the service role, so none of this changes what the app shows.

-- 1. RLS helpers callable by anon too (they return false / null when signed out), so policies that
--    mention is_admin() return rows instead of "permission denied for function is_admin" (SEC-12).
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_profile_id() to anon, authenticated;

-- 2. Sessions: clients-only events only for people who may see them, private sessions only for the
--    studio and the client booked into them. Everything else on the timetable stays public.
create or replace function public.can_see_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.bookings b
                 where b.session_id = p_session and b.profile_id = public.my_profile_id())
      or (not coalesce((select t.private from public.class_sessions s
                        join public.class_types t on t.id = s.class_type_id where s.id = p_session), false)
          and public.can_access_event(public.my_profile_id(), p_session))
$$;
revoke all on function public.can_see_session(uuid) from public;
grant execute on function public.can_see_session(uuid) to anon, authenticated, service_role;

drop policy if exists "public read sessions" on public.class_sessions;
create policy "public read sessions" on public.class_sessions for select to anon, authenticated
  using (public.can_see_session(id));

-- 3. Studio settings: only the public columns (no alert email, bank details, heartbeats, retention).
revoke select on public.studio_settings from anon, authenticated;
grant select (id, studio_name, timezone, currency, cancellation_cutoff_hours, booking_window_days,
              waitlist_close_minutes, trader_name, address, contact_email, contact_phone, instagram_handle,
              map_url, intro_line, status_banner, policy_version)
  on public.studio_settings to anon, authenticated;
create or replace view public.studio_public with (security_invoker = true) as
  select id, studio_name, timezone, currency, cancellation_cutoff_hours, booking_window_days,
         waitlist_close_minutes, trader_name, address, contact_email, contact_phone, instagram_handle,
         map_url, intro_line, status_banner, policy_version
  from public.studio_settings;
revoke all on public.studio_public from anon, authenticated;
grant select on public.studio_public to anon, authenticated;

-- 4. No TRUNCATE / TRIGGER / REFERENCES (TRUNCATE bypasses RLS and row triggers), now or on new tables.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
do $$ begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from anon, authenticated';
    execute 'alter default privileges for role postgres in schema public revoke maintain on tables from anon, authenticated';
  end if;
end $$;

-- 5. Health, consent and studio-admin tables are written by the server only.
revoke insert, update, delete on public.health_notes, public.health_history, public.consents,
  public.compliance_items, public.template_slots, public.timetable_templates from anon, authenticated;

-- 6. The credit ledger can't be emptied by TRUNCATE either (the row trigger doesn't fire for it).
create or replace function public.credit_ledger_no_truncate() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'credit_ledger is append-only';
end $$;
revoke all on function public.credit_ledger_no_truncate() from public, anon, authenticated;
drop trigger if exists credit_ledger_no_truncate on public.credit_ledger;
create trigger credit_ledger_no_truncate before truncate on public.credit_ledger
  for each statement execute function public.credit_ledger_no_truncate();
