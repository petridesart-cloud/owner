-- Her notes, round 4.

-- ── Passwords ───────────────────────────────────────────────────────────────
-- Sign-in with email + password; the email is confirmed once with a code. The server needs to know
-- whether a login already exists for an email (and whether it is confirmed / has a password) to
-- handle existing code-only accounts and unfinished sign-ups.
create or replace function public.auth_user_by_email(p_email text)
returns table (id uuid, confirmed boolean, has_password boolean)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email_confirmed_at is not null, coalesce(u.encrypted_password, '') <> ''
    from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;
revoke execute on function public.auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_by_email(text) to service_role;

-- "Special event" is just "Event" everywhere (her note).
update public.class_types set name = 'Event' where kind = 'event' and name = 'Special Event';

-- ── Events ──────────────────────────────────────────────────────────────────
-- An optional question for people booking an event (e.g. "Any dietary requirements?"), their answers,
-- and a note the studio adds when booking someone by hand.
alter table public.class_sessions add column signup_question text;
alter table public.bookings add column answer text, add column note text;

-- Free events (price €0) are booked without payment. Never let a paid class be booked "free" online.
create or replace function public.guard_free_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.paid_with = 'free' and new.source = 'online'
     and coalesce((select coalesce(s.price_cents, t.price_cents) from public.class_sessions s
                     join public.class_types t on t.id = s.class_type_id where s.id = new.session_id), 1) > 0 then
    raise exception 'not_free' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bookings_free_only_when_free before insert on public.bookings
  for each row execute function public.guard_free_booking();
revoke execute on function public.guard_free_booking() from public, anon, authenticated;
