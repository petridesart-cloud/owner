-- Supabase advisor findings before launch (no behaviour change).

-- Pin search_path on the remaining helper functions.
alter function public.ledger_append_only() set search_path = public;
alter function public.phone_key(text) set search_path = public;
alter function public.tidy_package_name(text) set search_path = public;
alter function public.tidy_package_names() set search_path = public;

-- Not callable through the public API: a trigger function, and the schedule (the server reads it with the service role).
revoke execute on function public.guard_clients_only() from public, anon, authenticated;
revoke execute on function public.session_availability(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.session_availability(timestamptz, timestamptz) to service_role;

-- Indexes for the lookups the app makes most (client pages, ledger, payments, waitlist).
create index if not exists credit_ledger_profile_idx on public.credit_ledger (profile_id, created_at desc);
create index if not exists credit_ledger_lot_idx on public.credit_ledger (lot_id);
create index if not exists credit_ledger_booking_idx on public.credit_ledger (booking_id);
create index if not exists payments_profile_idx on public.payments (profile_id, created_at desc);
create index if not exists payments_booking_idx on public.payments (booking_id);
create index if not exists bookings_payment_idx on public.bookings (payment_id);
create index if not exists credit_lots_payment_idx on public.credit_lots (payment_id);
create index if not exists notifications_profile_idx on public.notifications (profile_id);
create index if not exists waitlist_profile_idx on public.waitlist_entries (profile_id);
create index if not exists event_access_profile_idx on public.event_access (profile_id);
create index if not exists class_sessions_template_idx on public.class_sessions (template_id);
