-- WP1 (A-002, A-008, A-103): link login accounts to client profiles only once the email is proven.
--
-- Before: handle_new_user linked any unlinked profile with the same email the moment an auth user was
-- inserted. Anyone who can create an auth user without proving the email (Supabase's own sign-up API
-- with autoconfirm, an email change without confirmation, the admin API) would inherit an imported,
-- DM or manually added client's profile, or a pending Studio-team admin profile.
--
-- Now:
--   * Inserting an auth user creates no profile and links nothing.
--   * When the email becomes confirmed in a LATER transaction (a code or link from the email was used),
--     the unlinked profile with exactly that email (case-insensitive) is linked, or a new one is created.
--   * When the email is confirmed in the SAME transaction as the insert (admin createUser with
--     email_confirm, or hosted autoconfirm), that is not proof of the email: a new profile is created only
--     if no profile uses that email; an existing one is never handed over. The app links those itself after
--     its own check (demo passwords), see ensureProfile(..., { link: true }).
--   * Pending Studio-team members live in team_invites; no admin profile exists before they sign in.

-- Emails are stored lower-case so lookups can use exact equality (no ilike wildcards).
update public.profiles set email = lower(email) where email is not null and email <> lower(email);

create or replace function public.profiles_lower_email() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.email is not null then new.email := lower(trim(new.email)); end if;
  if new.email = '' then new.email := null; end if;
  return new;
end $$;

drop trigger if exists profiles_lower_email on public.profiles;
create trigger profiles_lower_email before insert or update of email on public.profiles
  for each row execute function public.profiles_lower_email();

-- Pending Studio-team members (admin access is granted on their first code-verified sign-in).
create table if not exists public.team_invites (
  email text primary key check (email = lower(email)),
  full_name text,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;
-- No policies: server (service role) only.

-- Admin profiles pre-created by the old "Add someone" (never signed in) become invites.
insert into public.team_invites (email, full_name)
select lower(email), full_name from public.profiles
 where role = 'admin' and user_id is null and deleted_at is null and email is not null
on conflict (email) do nothing;
update public.profiles set role = 'client'
 where role = 'admin' and user_id is null and deleted_at is null;

-- Insert: remember (for this transaction only) that the user is new; nothing is linked or created yet.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.new_user_' || replace(new.id::text, '-', ''), '1', true);
  return new;
end $$;

-- Confirmation: link by exact email, but only when the confirmation came after the insert.
create or replace function public.handle_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
  same_tx boolean := coalesce(current_setting('app.new_user_' || replace(new.id::text, '-', ''), true), '') = '1';
begin
  if exists (select 1 from public.profiles where user_id = new.id) then return new; end if;
  if new.email is null then return new; end if;
  select id into existing from public.profiles
   where email = lower(new.email) and deleted_at is null limit 1;
  if existing is null then
    insert into public.profiles (user_id, email) values (new.id, lower(new.email)) on conflict do nothing;
  elsif not same_tx then
    update public.profiles set user_id = new.id where id = existing and user_id is null;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;

-- Rate-limit code requests now use rate_events (keyed HMACs); the old unsalted hashes go.
delete from public.otp_requests where true;
