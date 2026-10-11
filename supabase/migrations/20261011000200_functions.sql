-- Re·Form Pilates — booking engine
-- Every capacity-changing operation locks the class_sessions row (SELECT ... FOR UPDATE),
-- so concurrent requests for the last reformer are serialised and only one can win.
-- These functions are SECURITY DEFINER and executable only by service_role: the
-- Next.js server verifies the user's session and passes the profile id explicitly.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.settings() returns public.studio_settings
language sql stable security definer set search_path = public as $$
  select * from public.studio_settings where id = 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin' and deleted_at is null)
$$;

create or replace function public.my_profile_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where user_id = auth.uid() and deleted_at is null
$$;

-- Spots in use: confirmed + live holds + live waitlist offers (an offer reserves the spot).
create or replace function public.spots_taken(p_session uuid, p_exclude_profile uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.bookings b
      where b.session_id = p_session
        and (b.status = 'confirmed' or (b.status = 'held' and b.hold_expires_at > now()))
        and (p_exclude_profile is null or b.profile_id <> p_exclude_profile))::int
  + (select count(*) from public.waitlist_entries w
      where w.session_id = p_session and w.status = 'offered' and w.offer_expires_at > now()
        and (p_exclude_profile is null or w.profile_id <> p_exclude_profile))::int
$$;

-- Give a credit back: to its original lot if still valid, otherwise a fresh 30-day lot.
create or replace function public.return_credit(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  lot public.credit_lots;
  kind public.credit_kind;
  new_lot uuid;
begin
  select * into b from public.bookings where id = p_booking;
  select ct.credit_kind into kind
    from public.class_sessions s join public.class_types ct on ct.id = s.class_type_id
   where s.id = b.session_id;

  if b.paid_with = 'credit' and b.credit_lot_id is not null then
    select * into lot from public.credit_lots where id = b.credit_lot_id for update;
    if lot.expires_at is null or lot.expires_at > now() + interval '1 day' then
      update public.credit_lots set remaining = remaining + 1 where id = lot.id;
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason, booking_id)
        values (b.profile_id, lot.id, lot.credit_kind, 1, p_reason, b.id);
      return;
    end if;
    kind := lot.credit_kind;
  elsif b.paid_with = 'payment' then
    if kind is null then
      -- Events have no credit type: flag the payment for a manual refund.
      update public.payments set status = 'needs_refund' where id = b.payment_id and status = 'paid';
      return;
    end if;
  else
    return; -- manual / free bookings: nothing to give back
  end if;

  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, note)
    values (b.profile_id, kind, 1, 1, now() + interval '30 days', 'Returned: ' || p_reason)
    returning id into new_lot;
  insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason, booking_id)
    values (b.profile_id, new_lot, kind, 1, p_reason, b.id);
end $$;

-- When a spot is re-filled, refund the oldest late cancellation flagged for it.
create or replace function public.apply_late_fill_refund(p_session uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  late_id uuid;
begin
  select id into late_id from public.bookings
   where session_id = p_session and status = 'late_cancelled' and late_refund_pending
   order by cancelled_at limit 1 for update;
  if late_id is null then return null; end if;
  update public.bookings set late_refund_pending = false where id = late_id;
  perform public.return_credit(late_id, 'late_fill_refund');
  return late_id;
end $$;

-- ---------------------------------------------------------------------------
-- Booking
-- p_mode: 'credit' (confirm now), 'payment' (hold while paying), 'manual' / 'free' (admin)
-- ---------------------------------------------------------------------------
create or replace function public.book_session(
  p_profile uuid, p_session uuid, p_mode text, p_source public.booking_source default 'online'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  ct public.class_types;
  cfg public.studio_settings := public.settings();
  lot public.credit_lots;
  new_id uuid;
  st public.booking_status;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.status <> 'scheduled' then raise exception 'class_cancelled' using errcode = 'P0001'; end if;
  if p_source = 'online' and s.starts_at <= now() then raise exception 'class_started' using errcode = 'P0001'; end if;
  if p_source = 'manual' and s.ends_at <= now() - interval '1 day' then raise exception 'class_past' using errcode = 'P0001'; end if;

  select * into ct from public.class_types where id = s.class_type_id;

  -- Clear stale holds for this class so they don't block the unique index or capacity.
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
    select * into lot from public.credit_lots
     where profile_id = p_profile and credit_kind = ct.credit_kind and remaining > 0
       and (expires_at is null or expires_at > s.starts_at)
     order by expires_at nulls last, created_at
     limit 1 for update;
    if not found then raise exception 'no_credits' using errcode = 'P0001'; end if;
    update public.credit_lots set remaining = remaining - 1 where id = lot.id;
    insert into public.bookings (session_id, profile_id, status, source, paid_with, credit_lot_id, confirmed_at)
      values (p_session, p_profile, 'confirmed', p_source, 'credit', lot.id, now())
      returning id into new_id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason, booking_id)
      values (p_profile, lot.id, lot.credit_kind, -1, 'booking', new_id);
    st := 'confirmed';
  elsif p_mode = 'payment' then
    insert into public.bookings (session_id, profile_id, status, source, hold_expires_at)
      values (p_session, p_profile, 'held', p_source, now() + make_interval(mins => cfg.hold_minutes))
      returning id into new_id;
    st := 'held';
  elsif p_mode in ('manual', 'free') then
    insert into public.bookings (session_id, profile_id, status, source, paid_with, confirmed_at)
      values (p_session, p_profile, 'confirmed', p_source, p_mode::public.paid_with, now())
      returning id into new_id;
    st := 'confirmed';
  else
    raise exception 'bad_mode' using errcode = 'P0001';
  end if;

  -- A waitlist offer or entry for this client is now fulfilled.
  update public.waitlist_entries set status = 'claimed'
   where session_id = p_session and profile_id = p_profile and status in ('waiting', 'offered');

  if st = 'confirmed' then perform public.apply_late_fill_refund(p_session); end if;

  return jsonb_build_object('booking_id', new_id, 'status', st);
end $$;

-- Called by the payment webhook (or mock checkout) once money has actually moved.
create or replace function public.confirm_payment(p_payment uuid, p_provider_ref text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  b public.bookings;
  s public.class_sessions;
  prod public.products;
  lot_id uuid;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p.status = 'paid' then return jsonb_build_object('status', 'already_paid', 'booking_id', p.booking_id); end if;

  update public.payments set status = 'paid', paid_at = now(), provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p.id;

  if p.purpose = 'pack' then
    select * into prod from public.products where id = p.product_id;
    insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, payment_id, note)
      values (p.profile_id, prod.credit_kind, prod.credits, prod.credits,
              case when prod.validity_days is null then null else now() + make_interval(days => prod.validity_days) end,
              p.id, prod.name)
      returning id into lot_id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, reason)
      values (p.profile_id, lot_id, prod.credit_kind, prod.credits, 'purchase');
    return jsonb_build_object('status', 'credits_added', 'lot_id', lot_id);
  end if;

  select * into b from public.bookings where id = p.booking_id for update;
  select * into s from public.class_sessions where id = b.session_id for update;

  if b.status = 'confirmed' then
    return jsonb_build_object('status', 'confirmed', 'booking_id', b.id);
  end if;

  -- Hold still valid, or expired but the spot is still free: confirm.
  if s.status = 'scheduled' and (
       (b.status = 'held' and b.hold_expires_at > now())
       or public.spots_taken(s.id, b.profile_id) < s.capacity
     ) and not exists (
       select 1 from public.bookings x where x.session_id = s.id and x.profile_id = b.profile_id
        and x.status = 'confirmed' and x.id <> b.id)
  then
    update public.bookings set status = 'confirmed', paid_with = 'payment', payment_id = p.id,
           hold_expires_at = null, confirmed_at = now()
     where id = b.id;
    perform public.apply_late_fill_refund(s.id);
    return jsonb_build_object('status', 'confirmed', 'booking_id', b.id);
  end if;

  -- Paid too late and the spot is gone: flag for refund.
  update public.bookings set status = 'expired', payment_id = p.id where id = b.id;
  update public.payments set status = 'needs_refund' where id = p.id;
  return jsonb_build_object('status', 'needs_refund', 'booking_id', b.id);
end $$;

-- ---------------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------------
create or replace function public.join_waitlist(p_profile uuid, p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  new_id uuid;
  pos int;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found or s.status <> 'scheduled' then raise exception 'class_cancelled' using errcode = 'P0001'; end if;
  if s.starts_at <= now() then raise exception 'class_started' using errcode = 'P0001'; end if;
  if exists (select 1 from public.bookings where session_id = p_session and profile_id = p_profile and status in ('held','confirmed')) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  if public.spots_taken(p_session) < s.capacity then raise exception 'not_full' using errcode = 'P0001'; end if;

  insert into public.waitlist_entries (session_id, profile_id) values (p_session, p_profile)
    on conflict do nothing returning id into new_id;
  if new_id is null then raise exception 'already_waitlisted' using errcode = 'P0001'; end if;

  select count(*) into pos from public.waitlist_entries
   where session_id = p_session and status = 'waiting'
     and created_at <= (select created_at from public.waitlist_entries where id = new_id);
  return jsonb_build_object('entry_id', new_id, 'position', pos);
end $$;

-- Expire stale offers and offer free spots to the next people in line.
-- Returns the entries that just received an offer (the app notifies them).
create or replace function public.process_waitlist(p_session uuid)
returns table (entry_id uuid, profile_id uuid, offer_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  cfg public.studio_settings := public.settings();
  free int;
  nxt public.waitlist_entries;
  exp timestamptz;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then return; end if;

  update public.waitlist_entries w set status = 'expired'
   where w.session_id = p_session and w.status = 'offered' and w.offer_expires_at <= now();
  update public.bookings set status = 'expired'
   where session_id = p_session and status = 'held' and hold_expires_at <= now();

  if s.status <> 'scheduled' or s.starts_at <= now() then return; end if;

  free := s.capacity - public.spots_taken(p_session);
  while free > 0 loop
    select * into nxt from public.waitlist_entries w
     where w.session_id = p_session and w.status = 'waiting'
     order by w.created_at limit 1 for update;
    exit when not found;

    -- Offer window: N minutes, but not past the cancellation cutoff;
    -- if we're already inside the cutoff, until the class starts.
    exp := least(now() + make_interval(mins => cfg.waitlist_window_minutes),
                 s.starts_at - make_interval(hours => cfg.cancellation_cutoff_hours));
    if exp <= now() + interval '10 minutes' then
      exp := least(now() + make_interval(mins => cfg.waitlist_window_minutes), s.starts_at);
    end if;

    update public.waitlist_entries set status = 'offered', offered_at = now(), offer_expires_at = exp
     where id = nxt.id;
    entry_id := nxt.id; profile_id := nxt.profile_id; offer_expires_at := exp;
    return next;
    free := free - 1;
  end loop;
end $$;

create or replace function public.leave_waitlist(p_profile uuid, p_entry uuid)
returns table (entry_id uuid, profile_id uuid, offer_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  w public.waitlist_entries;
begin
  select * into w from public.waitlist_entries where id = p_entry and waitlist_entries.profile_id = p_profile for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  update public.waitlist_entries set status = 'left' where id = w.id and status in ('waiting', 'offered');
  return query select * from public.process_waitlist(w.session_id);
end $$;

-- ---------------------------------------------------------------------------
-- Cancellation
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(p_booking uuid, p_profile uuid, p_admin boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  s public.class_sessions;
  cfg public.studio_settings := public.settings();
  late boolean;
  result text;
begin
  select * into b from public.bookings where id = p_booking;
  if not found or (not p_admin and b.profile_id <> p_profile) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into s from public.class_sessions where id = b.session_id for update;
  select * into b from public.bookings where id = p_booking for update;

  if b.status = 'held' then
    update public.bookings set status = 'expired', cancelled_at = now() where id = b.id;
    return jsonb_build_object('status', 'released', 'session_id', s.id);
  end if;
  if b.status <> 'confirmed' then raise exception 'not_cancellable' using errcode = 'P0001'; end if;
  if s.starts_at <= now() and not p_admin then raise exception 'class_started' using errcode = 'P0001'; end if;

  late := now() > s.starts_at - make_interval(hours => cfg.cancellation_cutoff_hours);

  if late and not p_admin then
    update public.bookings set status = 'late_cancelled', cancelled_at = now(),
           late_refund_pending = cfg.refund_late_cancel_if_filled and paid_with in ('credit', 'payment')
     where id = b.id;
    result := 'late_cancelled';
  else
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = b.id;
    perform public.return_credit(b.id, 'cancel_refund');
    result := 'cancelled';
  end if;

  return jsonb_build_object('status', result, 'session_id', s.id);
end $$;

-- Studio cancels a class: every booking is cancelled and refunded (credit back,
-- or a credit for card payments; events are flagged for a manual refund).
create or replace function public.cancel_session(p_session uuid, p_reason text)
returns table (booking_id uuid, profile_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  r record;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.status = 'cancelled' then return; end if;

  update public.class_sessions set status = 'cancelled', cancelled_reason = p_reason where id = p_session;

  for r in select b.id, b.profile_id, b.status from public.bookings b
            where b.session_id = p_session and b.status in ('confirmed', 'held') for update
  loop
    update public.bookings set status = 'studio_cancelled', cancelled_at = now() where id = r.id;
    if r.status = 'confirmed' then
      perform public.return_credit(r.id, 'studio_cancel');
      booking_id := r.id; profile_id := r.profile_id;
      return next;
    end if;
  end loop;

  update public.waitlist_entries set status = 'cancelled'
   where session_id = p_session and status in ('waiting', 'offered');
end $$;

-- ---------------------------------------------------------------------------
-- Periodic tick: expire holds and offers, advance waitlists.
-- ---------------------------------------------------------------------------
create or replace function public.tick()
returns table (entry_id uuid, profile_id uuid, offer_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  for sid in
    select distinct w.session_id from public.waitlist_entries w
      join public.class_sessions s on s.id = w.session_id
     where s.status = 'scheduled' and s.starts_at > now()
       and (w.status = 'waiting' or (w.status = 'offered' and w.offer_expires_at <= now()))
  loop
    return query select * from public.process_waitlist(sid);
  end loop;
  update public.bookings set status = 'expired' where status = 'held' and hold_expires_at <= now();
  update public.waitlist_entries w set status = 'expired'
   where w.status in ('waiting', 'offered')
     and exists (select 1 from public.class_sessions s where s.id = w.session_id and s.starts_at <= now());
end $$;

-- ---------------------------------------------------------------------------
-- Timetable → sessions
-- ---------------------------------------------------------------------------
create or replace function public.generate_sessions(p_template uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  t public.timetable_templates;
  tz text := (public.settings()).timezone;
  n int;
begin
  select * into t from public.timetable_templates where id = p_template;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

  with days as (
    select d::date as day from generate_series(t.valid_from, t.valid_to, interval '1 day') d
  ), rows as (
    select ts.class_type_id,
           ((dy.day + ts.start_time) at time zone tz) as starts_at,
           coalesce(ts.duration_minutes, ct.default_duration_minutes) as dur,
           coalesce(ts.capacity, ct.default_capacity) as cap
      from days dy
      join public.template_slots ts on ts.template_id = t.id and ts.weekday = extract(isodow from dy.day)
      join public.class_types ct on ct.id = ts.class_type_id
  ), ins as (
    insert into public.class_sessions (class_type_id, template_id, starts_at, ends_at, capacity)
    select class_type_id, t.id, starts_at, starts_at + make_interval(mins => dur), cap
      from rows where starts_at > now()
    on conflict do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- Public availability (no personal data) for the schedule.
create or replace function public.session_availability(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, class_type_id uuid, type_slug text, type_name text, kind public.class_kind,
  credit_kind public.credit_kind, title text, description text, starts_at timestamptz, ends_at timestamptz,
  capacity int, spots_left int, waitlist_count int, price_cents int, location text, status public.session_status
)
language sql stable security definer set search_path = public as $$
  select s.id, s.class_type_id, ct.slug, ct.name, ct.kind, ct.credit_kind,
         coalesce(s.title, ct.name), coalesce(s.description, ct.description), s.starts_at, s.ends_at,
         s.capacity, greatest(s.capacity - public.spots_taken(s.id), 0),
         (select count(*)::int from public.waitlist_entries w where w.session_id = s.id and w.status in ('waiting','offered')),
         coalesce(s.price_cents, ct.price_cents), coalesce(s.location, ct.default_location), s.status
    from public.class_sessions s join public.class_types ct on ct.id = s.class_type_id
   where s.starts_at >= p_from and s.starts_at < p_to
   order by s.starts_at
$$;

-- Usable credits per kind for a profile.
create or replace function public.credit_balance(p_profile uuid)
returns table (credit_kind public.credit_kind, remaining int, next_expiry timestamptz)
language sql stable security definer set search_path = public as $$
  select l.credit_kind, sum(l.remaining)::int, min(l.expires_at)
    from public.credit_lots l
   where l.profile_id = p_profile and l.remaining > 0 and (l.expires_at is null or l.expires_at > now())
   group by l.credit_kind
$$;

-- ---------------------------------------------------------------------------
-- Auth glue: link/create a profile when a login account is created.
-- Clients added manually (from DMs or the CSV import) are matched by email.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  existing uuid;
begin
  select id into existing from public.profiles
   where lower(email) = lower(new.email) and user_id is null and deleted_at is null limit 1;
  if existing is not null then
    update public.profiles set user_id = new.id where id = existing;
  else
    insert into public.profiles (user_id, email) values (new.id, lower(new.email))
      on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Right to erasure: strip personal data, keep the minimal booking/payment trail for accounting.
create or replace function public.erase_profile(p_profile uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  select user_id into uid from public.profiles where id = p_profile;
  update public.bookings set status = 'cancelled', cancelled_at = now()
   where profile_id = p_profile and status in ('held', 'confirmed')
     and session_id in (select id from public.class_sessions where starts_at > now());
  update public.waitlist_entries set status = 'left' where profile_id = p_profile and status in ('waiting', 'offered');
  delete from public.health_notes where profile_id = p_profile;
  update public.profiles set full_name = 'Deleted client', email = null, phone = null, admin_notes = null,
         marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;
  update public.notifications set recipient = '[erased]', body = '[erased]' where profile_id = p_profile;
  return uid; -- caller deletes the auth user
end $$;

-- ---------------------------------------------------------------------------
-- Privileges: engine functions are server-only.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_profile_id() to authenticated;
grant execute on function public.session_availability(timestamptz, timestamptz) to anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
