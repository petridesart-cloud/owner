-- Security review hardening: all writes go through the server (service role).
-- Clients holding the public anon key can only READ their own rows.

drop policy if exists "own profile update" on public.profiles;
drop policy if exists "health owner or instructor" on public.health_notes;

-- Health data (GDPR art. 9): the client can read their own note; only the
-- instructor (admin) can read all. Writes happen server-side so consent is logged.
create policy "health read owner or instructor" on public.health_notes for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
create policy "health instructor write" on public.health_notes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Belt and braces: anon/authenticated never write these tables directly.
revoke insert, update, delete on public.profiles, public.consents, public.bookings, public.waitlist_entries,
  public.credit_lots, public.credit_ledger, public.payments, public.notifications, public.otp_requests,
  public.audit_log, public.class_sessions, public.class_types, public.products, public.studio_settings
  from anon, authenticated;
revoke all on public.otp_requests, public.audit_log from anon, authenticated;
