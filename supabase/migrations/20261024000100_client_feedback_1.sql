-- Elysia's client notes, round 1 (docs/feedback/elysia-client-notes-1.md):
-- per-week packages, trials and drop-ins, cash/Revolut choice, weekly repeat bookings,
-- richer client profile, photos she uploads, 4-week booking window.

-- Packages: "2 per week · 1 month" etc.; trials and drop-ins are single-class products.
alter table public.products
  add column per_week int check (per_week between 1 and 7),
  add column months int check (months between 1 and 12),
  add column tag text not null default 'package' check (tag in ('package', 'trial', 'drop_in', 'membership'));

-- How the client said they'll pay (the admin still records how they actually paid).
alter table public.payments add column intended_method text check (intended_method in ('cash', 'revolut', 'bank_transfer', 'card_in_person', 'online'));

-- Client profile (her Account page).
alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column date_of_birth date,
  add column goal text,
  add column emergency_contact_name text,
  add column emergency_contact_phone text,
  add column photo_consent text check (photo_consent in ('face', 'no_face', 'none'));
-- Photo consent changes are logged like other consents.
alter type public.consent_type add value if not exists 'photos';

update public.profiles set first_name = split_part(full_name, ' ', 1), last_name = nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), '')
 where full_name is not null and first_name is null;

-- Health (special category, owner + instructor only; existing RLS on health_notes applies).
alter table public.health_notes
  add column injuries text,
  add column medication text,
  alter column note drop not null;

alter table public.studio_settings
  add column booking_window_days int not null default 28 check (booking_window_days between 7 and 120),
  add column studio_sections text[] not null default '{Reformers,Mat,"Changing room",Toilet,Bathroom,Kitchen}';

-- Weekly repeat bookings ("every Monday 16:30 and Wednesday 19:00").
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  class_type_id uuid not null references public.class_types(id),
  weekday smallint not null check (weekday between 1 and 7),  -- ISO, studio local
  start_time time not null,                                   -- studio local
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index recurring_rules_unique on public.recurring_rules (profile_id, class_type_id, weekday, start_time) where active;
alter table public.recurring_rules enable row level security;
create policy "own recurring rules" on public.recurring_rules for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
revoke insert, update, delete on public.recurring_rules from anon, authenticated;

-- Photos she uploads (logo, studio sections, events). Files live in the public "media" bucket.
create table public.media (
  id uuid primary key default gen_random_uuid(),
  slot text not null,            -- 'logo' | 'studio:<section>' | 'event:<session id>'
  path text not null,            -- object path in the media bucket
  caption text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index media_slot_idx on public.media (slot, sort, created_at);
alter table public.media enable row level security;
create policy "public read media" on public.media for select to anon, authenticated using (true);
revoke insert, update, delete on public.media from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, '{image/jpeg,image/png,image/webp}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Booking: 4-week window for online bookings; trial and drop-in modes
-- (reserve the spot, pay by cash or Revolut, the studio marks it paid).
-- ---------------------------------------------------------------------------
drop function if exists public.book_session(uuid, uuid, text, public.booking_source);
create or replace function public.book_session(
  p_profile uuid, p_session uuid, p_mode text, p_source public.booking_source default 'online', p_method text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  ct public.class_types;
  cfg public.studio_settings := public.settings();
  prod public.products;
  new_id uuid;
  first_lot uuid;
  pay_id uuid;
  st public.booking_status;
  amount int;
  label text;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.status <> 'scheduled' then raise exception 'class_cancelled' using errcode = 'P0001'; end if;
  if p_source = 'online' and s.starts_at <= now() then raise exception 'class_started' using errcode = 'P0001'; end if;
  if p_source = 'online' and s.starts_at > now() + make_interval(days => cfg.booking_window_days) then
    raise exception 'beyond_window' using errcode = 'P0001';
  end if;
  if p_source = 'manual' and s.ends_at <= now() - interval '1 day' then raise exception 'class_past' using errcode = 'P0001'; end if;
  select * into ct from public.class_types where id = s.class_type_id;

  update public.bookings set status = 'expired'
   where session_id = p_session and status = 'held' and hold_expires_at <= now();
  if exists (select 1 from public.bookings where session_id = p_session and profile_id = p_profile and status in ('held','confirmed')) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  if public.spots_taken(p_session, p_profile) >= s.capacity then
    raise exception 'full' using errcode = 'P0001';
  end if;

  if p_mode = 'credit' then
    if ct.credit_kind is null then raise exception 'credits_not_accepted' using errcode = 'P0001'; end if;
    insert into public.bookings (session_id, profile_id, status, source, paid_with, confirmed_at)
      values (p_session, p_profile, 'confirmed', p_source, 'credit', now()) returning id into new_id;
    first_lot := public.spend_credits(p_profile, ct.credit_kind, ct.credit_cost, new_id, s.starts_at);
    update public.bookings set credit_lot_id = first_lot where id = new_id;
    st := 'confirmed';
  elsif p_mode = 'payment' then
    if not cfg.online_payments_enabled and p_source = 'online' then raise exception 'online_payments_off' using errcode = 'P0001'; end if;
    insert into public.bookings (session_id, profile_id, status, source, hold_expires_at)
      values (p_session, p_profile, 'held', p_source, now() + make_interval(mins => cfg.hold_minutes)) returning id into new_id;
    st := 'held';
  elsif p_mode in ('pay_at_studio', 'drop_in', 'trial') then
    if p_mode = 'pay_at_studio' and p_source = 'online' and not cfg.allow_pay_later then
      raise exception 'pay_later_off' using errcode = 'P0001';
    end if;
    if p_mode = 'trial' then
      if ct.credit_kind is null then raise exception 'trial_not_available' using errcode = 'P0001'; end if;
      -- A trial is only for someone booking this type of class for the first time.
      if exists (select 1 from public.bookings b join public.class_sessions x on x.id = b.session_id
                  join public.class_types t on t.id = x.class_type_id
                  where b.profile_id = p_profile and t.credit_kind = ct.credit_kind
                    and b.status in ('held', 'confirmed', 'late_cancelled', 'no_show'))
         or exists (select 1 from public.payments pm join public.products pr on pr.id = pm.product_id
                     where pm.profile_id = p_profile and pr.tag = 'trial' and pr.credit_kind = ct.credit_kind
                       and pm.status in ('pending', 'paid')) then
        raise exception 'trial_used' using errcode = 'P0001';
      end if;
    end if;
    if p_source = 'online' then
      -- At most one unpaid upcoming class at a time.
      if exists (select 1 from public.bookings b join public.class_sessions x on x.id = b.session_id
                  where b.profile_id = p_profile and b.status = 'confirmed' and b.paid_with = 'pay_at_studio' and x.ends_at > now()) then
        raise exception 'unpaid_limit' using errcode = 'P0001';
      end if;
    end if;
    if p_mode in ('drop_in', 'trial') and ct.credit_kind is not null then
      select * into prod from public.products where tag = p_mode and credit_kind = ct.credit_kind and active order by sort_order limit 1;
    end if;
    amount := coalesce(prod.price_cents, s.price_cents, ct.price_cents);
    label := coalesce(prod.name, coalesce(s.title, ct.name)) || ' · ' || to_char(s.starts_at at time zone cfg.timezone, 'Dy DD Mon HH24:MI');
    insert into public.bookings (session_id, profile_id, status, source, paid_with, confirmed_at)
      values (p_session, p_profile, 'confirmed', p_source, 'pay_at_studio', now()) returning id into new_id;
    insert into public.payments (profile_id, provider, amount_cents, purpose, description, booking_id, status, product_id, intended_method)
      values (p_profile, 'offline', amount, 'booking', label, new_id, 'pending', prod.id, p_method)
      returning id into pay_id;
    update public.bookings set payment_id = pay_id where id = new_id;
    st := 'confirmed';
  elsif p_mode in ('manual', 'free') then
    insert into public.bookings (session_id, profile_id, status, source, paid_with, confirmed_at)
      values (p_session, p_profile, 'confirmed', p_source, p_mode::public.paid_with, now()) returning id into new_id;
    st := 'confirmed';
  else
    raise exception 'bad_mode' using errcode = 'P0001';
  end if;

  update public.waitlist_entries set status = 'claimed'
   where session_id = p_session and profile_id = p_profile and status in ('waiting', 'offered');
  if st = 'confirmed' then perform public.apply_late_fill_refund(p_session); end if;
  return jsonb_build_object('booking_id', new_id, 'status', st);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_profile_id() to authenticated;
grant execute on function public.session_availability(timestamptz, timestamptz) to anon, authenticated;
grant execute on all functions in schema public to service_role;
