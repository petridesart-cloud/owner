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


-- ── Her answers ─────────────────────────────────────────────────────────────
-- No 30-minute grace after a late waitlist booking: joining the waitlist means they want the class.
create or replace function public.process_waitlist(p_session uuid)
returns table (entry_id uuid, profile_id uuid, offer_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  ct public.class_types;
  cfg public.studio_settings := public.settings();
  closes timestamptz;
  free int;
  nxt public.waitlist_entries;
  exp timestamptz;
  bid uuid;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then return; end if;
  select * into ct from public.class_types where id = s.class_type_id;

  update public.waitlist_entries w set status = 'expired'
   where w.session_id = p_session and w.status = 'offered' and w.offer_expires_at <= now();
  update public.bookings set status = 'expired'
   where session_id = p_session and status = 'held' and hold_expires_at <= now();

  closes := s.starts_at - make_interval(mins => cfg.waitlist_close_minutes);
  if s.status <> 'scheduled' or now() >= closes then return; end if;

  free := s.capacity - public.spots_taken(p_session);
  while free > 0 loop
    select * into nxt from public.waitlist_entries w
     where w.session_id = p_session and w.status = 'waiting'
     order by w.created_at limit 1 for update;
    exit when not found;

    bid := null;
    if ct.credit_kind is not null then
      begin
        bid := (public.book_session(nxt.profile_id, p_session, 'credit', 'online') ->> 'booking_id')::uuid;  -- marks the entry claimed
      exception when others then
        bid := null;  -- no usable class (or any other refusal): fall back to an offer
      end;
    end if;

    if bid is not null then
      entry_id := nxt.id; profile_id := nxt.profile_id; offer_expires_at := null;
    else
      -- No package class (or an event): hold the spot for them, at most until the waitlist closes.
      exp := least(now() + make_interval(mins => cfg.waitlist_window_minutes), closes);
      update public.waitlist_entries set status = 'offered', offered_at = now(), offer_expires_at = exp
       where id = nxt.id;
      entry_id := nxt.id; profile_id := nxt.profile_id; offer_expires_at := exp;
    end if;
    return next;
    free := free - 1;
  end loop;
end $$;

-- SMS for the waitlist: not yet (email only).
update public.studio_settings set waitlist_sms = false where id = 1;

-- A freeze runs from one date to another: no bookings with that package in between.
create table public.lot_freezes (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.credit_lots(id) on delete cascade,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text,
  created_at timestamptz not null default now()
);
create index lot_freezes_lot_idx on public.lot_freezes (lot_id);
alter table public.lot_freezes enable row level security;
revoke all on public.lot_freezes from anon, authenticated;

create or replace function public.lot_usable_for(p_lot public.credit_lots, p_class timestamptz) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  st timestamptz;
  exp timestamptz;
begin
  -- Not during a freeze (her rule, round 4).
  if exists (select 1 from public.lot_freezes f where f.lot_id = p_lot.id
              and (p_class at time zone (public.settings()).timezone)::date between f.starts_on and f.ends_on) then
    return false;
  end if;
  if p_lot.validity_days is null then
    return p_lot.expires_at is null or p_lot.expires_at > p_class;
  end if;
  select * into r from public.lot_class_range(p_lot.id);
  if p_lot.started_at is not null and p_lot.started_at <= now() then
    st := p_lot.started_at;
  else
    st := least(coalesce(r.first_class, p_class), p_class);
  end if;
  exp := public.compute_expiry(st, p_lot.validity_days);
  -- The new class and every class already booked on this lot must fall within the validity.
  return p_class < exp and (r.last_class is null or r.last_class < exp);
end $$;

create or replace function public.spend_credits(p_profile uuid, p_kind public.credit_kind, p_cost int, p_booking uuid, p_valid_at timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  need int := p_cost;
  lot public.credit_lots;
  take int;
  first_lot uuid;
  touched uuid[] := '{}';
  total_any int;
begin
  for lot in select * from public.credit_lots
              where profile_id = p_profile and credit_kind = p_kind and remaining > 0
                and (expires_at is null or expires_at > now())
              order by coalesce(expires_at, 'infinity'::timestamptz), created_at
              for update
  loop
    exit when need = 0;
    continue when not public.lot_usable_for(lot, p_valid_at);
    take := least(need, lot.remaining);
    update public.credit_lots set remaining = remaining - take where id = lot.id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, booking_id)
      values (p_profile, lot.id, p_kind, -take, 'booking_debit', p_booking);
    first_lot := coalesce(first_lot, lot.id);
    touched := touched || lot.id;
    need := need - take;
  end loop;

  if need > 0 then
    select coalesce(sum(remaining), 0) into total_any from public.credit_lots
     where profile_id = p_profile and credit_kind = p_kind and remaining > 0 and (expires_at is null or expires_at > now());
    if exists (select 1 from public.credit_lots l join public.lot_freezes f on f.lot_id = l.id
                where l.profile_id = p_profile and l.credit_kind = p_kind and l.remaining > 0
                  and (p_valid_at at time zone (public.settings()).timezone)::date between f.starts_on and f.ends_on) then
      raise exception 'package_frozen' using errcode = 'P0001';
    end if;
    if total_any >= p_cost then raise exception 'beyond_expiry' using errcode = 'P0001'; end if;
    raise exception 'no_credits' using errcode = 'P0001';
  end if;

  perform public.recalc_lot_expiry(t) from unnest(touched) t;
  return first_lot;
end $$;

create or replace function public.admin_adjust_lot(
  p_lot uuid, p_action text, p_days int, p_date date, p_credits int, p_reason text, p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.credit_lots;
  tz text := (public.settings()).timezone;
  new_end timestamptz;
  note text;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into l from public.credit_lots where id = p_lot for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

  if p_action = 'freeze' then
    -- Her rule: a freeze runs From–To. No bookings with this package in between; the end date moves by the same days.
    if p_date is null or coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_days' using errcode = 'P0001'; end if;
    if exists (select 1 from public.credit_ledger g join public.bookings b on b.id = g.booking_id
                 join public.class_sessions s on s.id = b.session_id
                where g.lot_id = l.id and g.entry_type = 'booking_debit' and b.status = 'confirmed'
                  and (s.starts_at at time zone tz)::date between p_date and p_date + p_days - 1) then
      raise exception 'booked_in_freeze' using errcode = 'P0001';
    end if;
    insert into public.lot_freezes (lot_id, starts_on, ends_on, reason) values (l.id, p_date, p_date + p_days - 1, p_reason);
    if l.validity_days is not null then
      update public.credit_lots set validity_days = validity_days + p_days where id = l.id;
      perform public.recalc_lot_expiry(l.id);
    elsif l.expires_at is not null then
      update public.credit_lots set expires_at = expires_at + make_interval(days => p_days) where id = l.id;
    end if;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, 0, 'freeze_extension',
              format('Frozen %s – %s', to_char(p_date, 'DD.MM.YYYY'), to_char(p_date + p_days - 1, 'DD.MM.YYYY')) || ': ' || p_reason, p_actor);

  elsif p_action = 'extend' then
    if coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_days' using errcode = 'P0001'; end if;
    if l.validity_days is not null then
      update public.credit_lots set validity_days = validity_days + p_days where id = l.id;
      perform public.recalc_lot_expiry(l.id);
    elsif l.expires_at is not null then
      update public.credit_lots set expires_at = expires_at + make_interval(days => p_days) where id = l.id;
    else
      raise exception 'no_end_date' using errcode = 'P0001';  -- nothing to extend: these classes never expire
    end if;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, 0, 'admin_adjustment', format('Extended %s days', p_days) || ': ' || p_reason, p_actor);

  elsif p_action = 'end' then
    if p_date is null then raise exception 'bad_date' using errcode = 'P0001'; end if;
    new_end := (p_date + 1)::timestamp at time zone tz;  -- usable through that day
    if new_end <= now() then raise exception 'bad_date' using errcode = 'P0001'; end if;
    if exists (select 1 from public.credit_ledger g join public.bookings b on b.id = g.booking_id
                 join public.class_sessions s on s.id = b.session_id
                where g.lot_id = l.id and g.entry_type = 'booking_debit' and b.status = 'confirmed' and s.starts_at >= new_end) then
      raise exception 'booked_after' using errcode = 'P0001';
    end if;
    update public.credit_lots set validity_days = null, expires_at = new_end, started_at = coalesce(started_at, now()) where id = l.id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, 0, 'admin_adjustment', 'Ends ' || to_char(p_date, 'DD.MM.YYYY') || ': ' || p_reason, p_actor);

  elsif p_action = 'add' then
    if coalesce(p_credits, 0) < 1 or p_credits > 50 then raise exception 'bad_credits' using errcode = 'P0001'; end if;
    update public.credit_lots set total = total + p_credits, remaining = remaining + p_credits where id = l.id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, p_credits, 'admin_adjustment', p_reason, p_actor);

  elsif p_action = 'remove' then
    if coalesce(p_credits, 0) < 1 then raise exception 'bad_credits' using errcode = 'P0001'; end if;
    if p_credits > l.remaining then raise exception 'not_enough_credits' using errcode = 'P0001'; end if;
    update public.credit_lots set remaining = remaining - p_credits where id = l.id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, -p_credits, 'admin_adjustment', p_reason, p_actor);
  else
    raise exception 'bad_action' using errcode = 'P0001';
  end if;
end $$;

-- ── Rewards and discount codes ──────────────────────────────────────────────
-- A personal reward (profile_id set, one use) or a code for anyone (e.g. SUMMER10). % or € off the
-- next package, or free classes added to it. A use is counted while a request is pending or paid,
-- so an expired request frees it again.
create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,24}$'),
  kind text not null check (kind in ('percent', 'amount', 'free_classes')),
  value int not null check (value > 0),
  profile_id uuid references public.profiles(id) on delete cascade,
  note text,
  expires_on date,
  max_uses int check (max_uses is null or max_uses > 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index discount_codes_profile_idx on public.discount_codes (profile_id);
alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;
alter table public.payments add column discount_code_id uuid references public.discount_codes(id) on delete set null;
create index payments_discount_code_idx on public.payments (discount_code_id);

-- ── Stats history ───────────────────────────────────────────────────────────
-- One row per month of a year (studio time): classes, spots, bookings, attended, revenue,
-- packages sold, new clients. Aggregated in SQL so a busy year never hits the API row limit.
create or replace function public.stats_months(p_year int)
returns table (month int, classes int, spots int, booked int, attended int, reformer_booked int, reformer_spots int,
               mat_booked int, mat_spots int, revenue_cents bigint, packs_sold int, new_clients int)
language sql stable security definer set search_path = public as $$
  with m as (select generate_series(1, 12) as month),
  s as (
    select extract(month from cs.starts_at at time zone 'Europe/Nicosia')::int as month, ct.kind::text as kind, cs.capacity,
           (select count(*) from public.bookings b where b.session_id = cs.id and b.status in ('confirmed', 'no_show'))::int as booked,
           (select count(*) from public.bookings b where b.session_id = cs.id and b.checked_in_at is not null)::int as attended
      from public.class_sessions cs join public.class_types ct on ct.id = cs.class_type_id
     where cs.status = 'scheduled' and extract(year from cs.starts_at at time zone 'Europe/Nicosia') = p_year
  ),
  p as (
    select extract(month from py.paid_at at time zone 'Europe/Nicosia')::int as month, py.amount_cents, py.purpose
      from public.payments py
     where py.status = 'paid' and extract(year from py.paid_at at time zone 'Europe/Nicosia') = p_year
  ),
  c as (
    select extract(month from pr.created_at at time zone 'Europe/Nicosia')::int as month
      from public.profiles pr
     where pr.role = 'client' and pr.deleted_at is null and extract(year from pr.created_at at time zone 'Europe/Nicosia') = p_year
  )
  select m.month,
    (select count(*) from s where s.month = m.month)::int,
    (select coalesce(sum(capacity), 0) from s where s.month = m.month)::int,
    (select coalesce(sum(booked), 0) from s where s.month = m.month)::int,
    (select coalesce(sum(attended), 0) from s where s.month = m.month)::int,
    (select coalesce(sum(booked), 0) from s where s.month = m.month and s.kind = 'reformer')::int,
    (select coalesce(sum(capacity), 0) from s where s.month = m.month and s.kind = 'reformer')::int,
    (select coalesce(sum(booked), 0) from s where s.month = m.month and s.kind = 'mat')::int,
    (select coalesce(sum(capacity), 0) from s where s.month = m.month and s.kind = 'mat')::int,
    (select coalesce(sum(amount_cents), 0) from p where p.month = m.month)::bigint,
    (select count(*) from p where p.month = m.month and p.purpose = 'pack')::int,
    (select count(*) from c where c.month = m.month)::int
  from m order by m.month
$$;
revoke all on function public.stats_months(int) from public, anon, authenticated;
grant execute on function public.stats_months(int) to service_role;

-- A client uses a code once (a pending request counts; an expired or removed one frees it again).
create unique index payments_one_code_per_client on public.payments (discount_code_id, profile_id)
  where discount_code_id is not null and status in ('pending', 'paid');

-- Right to erasure: also personal rewards, booking answers and the studio's notes on bookings.
create or replace function public.erase_profile(p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  select user_id into uid from public.profiles where id = p_profile;
  update public.bookings set status = 'cancelled', cancelled_at = now()
   where profile_id = p_profile and status in ('held', 'confirmed')
     and session_id in (select id from public.class_sessions where starts_at > now());
  update public.bookings set answer = null, note = null where profile_id = p_profile and (answer is not null or note is not null);
  update public.waitlist_entries set status = 'left' where profile_id = p_profile and status in ('waiting', 'offered');
  update public.payments set status = 'cancelled' where profile_id = p_profile and status = 'pending';
  delete from public.health_notes where profile_id = p_profile;
  delete from public.health_history where profile_id = p_profile;
  delete from public.event_access where profile_id = p_profile;
  delete from public.recurring_rules where profile_id = p_profile;
  delete from public.discount_codes where profile_id = p_profile;
  update public.profiles set full_name = 'Deleted client', first_name = null, last_name = null, email = null, phone = null,
         date_of_birth = null, parq_completed_at = null, goal = null, emergency_contact_name = null, emergency_contact_phone = null,
         emergency_contact_relation = null, photo_consent = null,
         admin_notes = null, marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;
  update public.notifications set recipient = '[erased]', body = '[erased]' where profile_id = p_profile;
  return uid; -- caller deletes the auth user
end $$;
revoke all on function public.erase_profile(uuid) from public, anon, authenticated;
grant execute on function public.erase_profile(uuid) to service_role;
