-- Row-level security. The app server uses the service role for writes; these
-- policies are defence in depth for anyone holding the public anon key.

alter table public.studio_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.health_notes enable row level security;
alter table public.consents enable row level security;
alter table public.class_types enable row level security;
alter table public.timetable_templates enable row level security;
alter table public.template_slots enable row level security;
alter table public.class_sessions enable row level security;
alter table public.products enable row level security;
alter table public.payments enable row level security;
alter table public.credit_lots enable row level security;
alter table public.bookings enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.notifications enable row level security;
alter table public.otp_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.compliance_items enable row level security;

-- Public catalogue
create policy "public read settings" on public.studio_settings for select to anon, authenticated using (true);
create policy "public read class types" on public.class_types for select to anon, authenticated using (active or public.is_admin());
create policy "public read sessions" on public.class_sessions for select to anon, authenticated using (true);
create policy "public read products" on public.products for select to anon, authenticated using (active or public.is_admin());

-- Own records (+ admin)
create policy "own profile read" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy "own profile update" on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role = 'client');
create policy "admin profile write" on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Health data: only the client themself and the instructor.
create policy "health owner or instructor" on public.health_notes for all to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin())
  with check (profile_id = public.my_profile_id() or public.is_admin());

create policy "own consents" on public.consents for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
create policy "own bookings" on public.bookings for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
create policy "own waitlist" on public.waitlist_entries for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
create policy "own credit lots" on public.credit_lots for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
create policy "own ledger" on public.credit_ledger for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
create policy "own payments" on public.payments for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());

-- Admin only
create policy "admin templates" on public.timetable_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin slots" on public.template_slots for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin notifications" on public.notifications for select to authenticated using (public.is_admin());
create policy "admin audit" on public.audit_log for select to authenticated using (public.is_admin());
create policy "admin compliance" on public.compliance_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- otp_requests: no policies → service role only.
