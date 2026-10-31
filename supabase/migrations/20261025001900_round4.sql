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
