-- WP3 (A-004, A-005, A-082, part of A-064): per-person locks for trials and unpaid classes; a freed spot goes
-- to the waitlist first (cancel_booking advances it in the same transaction, and online bookings are refused with
-- waitlist_first while someone ahead is waiting); the waitlist respects the booking window; events can't be
-- cancelled by clients (the guard moves from TypeScript into cancel_booking).

-- ── A-004, A-005: book_session v5 ───────────────────────────────────────────────────────
create or replace function public.book_session(p_profile uuid, p_session uuid, p_mode text,
  p_source public.booking_source default 'online', p_method text default null) returns jsonb
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
  mine timestamptz;
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

  -- A-004: the per-person rules (one unpaid class, one trial per class type and phone) only hold if two
  -- requests for different classes can't check them at the same time. The class row lock doesn't cover that.
  if p_mode in ('pay_at_studio', 'drop_in', 'trial') then
    perform pg_advisory_xact_lock(hashtext('unpaid:' || p_profile::text));
    if p_mode = 'trial' then
      perform pg_advisory_xact_lock(hashtext('trial:' || coalesce(ct.credit_kind::text, '') || ':' ||
        coalesce((select public.phone_key(phone) from public.profiles where id = p_profile), p_profile::text)));
    end if;
  end if;

  update public.bookings set status = 'expired'
   where session_id = p_session and status = 'held' and hold_expires_at <= now();
  if exists (select 1 from public.bookings where session_id = p_session and profile_id = p_profile and status in ('held','confirmed')) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  if public.spots_taken(p_session, p_profile) >= s.capacity then
    raise exception 'full' using errcode = 'P0001';
  end if;

  -- A-005: while people are waiting (and the waitlist is still open) a free spot is theirs first.
  -- The first in line (or someone holding an offer) can still book; process_waitlist books them this way.
  if p_source = 'online' and now() < s.starts_at - make_interval(mins => cfg.waitlist_close_minutes) then
    select created_at into mine from public.waitlist_entries
     where session_id = p_session and profile_id = p_profile and status in ('waiting', 'offered');
    if exists (select 1 from public.waitlist_entries w
                where w.session_id = p_session and w.status = 'waiting' and w.profile_id <> p_profile
                  and (mine is null or w.created_at < mine)) then
      raise exception 'waitlist_first' using errcode = 'P0001';
    end if;
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
      -- A trial is only for someone booking this type of class for the first time (also by phone number).
      if not public.trial_eligible(p_profile, ct.credit_kind) then
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

-- ── A-005, A-064: cancel_booking v3 ─────────────────────────────────────────────────────
-- Returns {status, session_id, offers}: offers are the waitlist rows to notify (process_waitlist's rows).
create or replace function public.cancel_booking(p_booking uuid, p_profile uuid, p_admin boolean default false) returns jsonb
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
    result := 'released';
  else
    if b.status <> 'confirmed' then raise exception 'not_cancellable' using errcode = 'P0001'; end if;
    -- Events can't be cancelled by clients (the studio can still remove someone).
    if not p_admin and exists (select 1 from public.class_types t where t.id = s.class_type_id and t.kind = 'event') then
      raise exception 'event_no_cancel' using errcode = 'P0001';
    end if;
    if s.starts_at <= now() and not p_admin then raise exception 'class_started' using errcode = 'P0001'; end if;

    late := now() > s.starts_at - make_interval(hours => cfg.cancellation_cutoff_hours)
            and not (b.free_cancel_until is not null and now() <= b.free_cancel_until);  -- waitlist grace period (unused)

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
  end if;

  -- The freed spot goes to the waitlist in the same transaction, so nobody can take it in between.
  return jsonb_build_object('status', result, 'session_id', s.id,
    'offers', coalesce((select jsonb_agg(to_jsonb(o)) from public.process_waitlist(s.id) o), '[]'::jsonb));
end $$;

-- ── A-082: the waitlist respects the booking window ─────────────────────────────────────
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
  if s.starts_at > now() + make_interval(days => (public.settings()).booking_window_days) then
    raise exception 'beyond_window' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.bookings where session_id = p_session and profile_id = p_profile and status in ('held','confirmed')) then
    raise exception 'already_booked' using errcode = 'P0001';
  end if;
  -- A free spot that's waiting for the people already in line (waitlist_first) can still be queued for.
  if public.spots_taken(p_session) < s.capacity and not exists (
       select 1 from public.waitlist_entries w where w.session_id = p_session and w.status = 'waiting') then
    raise exception 'not_full' using errcode = 'P0001';
  end if;

  insert into public.waitlist_entries (session_id, profile_id) values (p_session, p_profile)
    on conflict do nothing returning id into new_id;
  if new_id is null then raise exception 'already_waitlisted' using errcode = 'P0001'; end if;

  select count(*) into pos from public.waitlist_entries
   where session_id = p_session and status = 'waiting'
     and created_at <= (select created_at from public.waitlist_entries where id = new_id);
  return jsonb_build_object('entry_id', new_id, 'position', pos);
end $$;
