-- The studio's real policy:
--  * 6h cancellation cutoff; pay in advance (no booking before paying)
--  * packages valid 30/60 days from the FIRST CLASS (provisional until it happens)
--  * no booking beyond a package's expiry
--  * closures freeze packages (expiry extended by closed days)
--  * 10% student discount on group packages; unpaid requests expire after 48h

alter type public.ledger_entry add value if not exists 'freeze_extension';

-- Settings
alter table public.studio_settings
  add column unpaid_request_expiry_hours int not null default 48 check (unpaid_request_expiry_hours between 1 and 720),
  add column expiry_reminder_days int not null default 5 check (expiry_reminder_days between 1 and 30),
  add column student_discount_pct int not null default 10 check (student_discount_pct between 0 and 50),
  add column revolut_link text not null default '',
  add column bank_account_name text not null default '',
  add column bank_iban text not null default '';
alter table public.studio_settings alter column cancellation_cutoff_hours set default 6;
alter table public.studio_settings alter column allow_pay_later set default false;
update public.studio_settings set cancellation_cutoff_hours = 6, allow_pay_later = false;

-- Payment methods
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('online', 'cash', 'card_in_person', 'bank_transfer', 'revolut'));
alter table public.payments add column discount_note text;

-- Group vs private packages (student discount applies to group packages only)
alter table public.products add column is_group boolean not null default true;

-- Students: verified in person; we never store card images.
alter table public.profiles add column student_verified_until date;

-- Credit lots: validity counted from the first class.
alter table public.credit_lots
  add column validity_days int check (validity_days between 1 and 366),
  add column started_at timestamptz;   -- first class start; null = "not yet started"

-- Closures (Christmas, Easter, Summer, public holidays). Suggestions need confirming.
create table public.closures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  confirmed boolean not null default false,
  suggested boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create unique index closures_unique_range on public.closures (starts_on, ends_on, name);
alter table public.closures enable row level security;
create policy "public read confirmed closures" on public.closures for select to anon, authenticated using (confirmed or public.is_admin());
revoke insert, update, delete on public.closures from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Expiry maths
-- ---------------------------------------------------------------------------
-- Number of distinct confirmed closure days within [from_date, to_date).
create or replace function public.closed_days(p_from date, p_to date) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct d)::int
    from public.closures c, generate_series(greatest(c.starts_on, p_from), least(c.ends_on, p_to - 1), interval '1 day') d
   where c.confirmed and c.starts_on < p_to and c.ends_on >= p_from
$$;

-- Expiry = start of the local day (first-class date + validity days + closed days in the window).
create or replace function public.compute_expiry(p_start timestamptz, p_validity int) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := (public.settings()).timezone;
  d0 date := (p_start at time zone tz)::date;
  ext int := 0;
  n int;
begin
  loop
    n := public.closed_days(d0, d0 + p_validity + ext);
    exit when n = ext;
    ext := n;
  end loop;
  return ((d0 + p_validity + ext)::timestamp) at time zone tz;
end $$;

-- Earliest / latest class currently paid for from a lot (net debit < 0).
create or replace function public.lot_class_range(p_lot uuid, out first_class timestamptz, out last_class timestamptz)
language sql stable security definer set search_path = public as $$
  select min(s.starts_at), max(s.starts_at)
    from (select booking_id from public.credit_ledger where lot_id = p_lot and booking_id is not null
           group by booking_id having sum(delta) < 0) x
    join public.bookings b on b.id = x.booking_id
    join public.class_sessions s on s.id = b.session_id
$$;

-- Recompute a lot's start and expiry. Once the first class has passed, the start is locked.
create or replace function public.recalc_lot_expiry(p_lot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.credit_lots;
  r record;
  new_start timestamptz;
  new_exp timestamptz;
begin
  select * into l from public.credit_lots where id = p_lot for update;
  if l.validity_days is null then return; end if;        -- fixed-expiry lot
  if l.started_at is not null and l.started_at <= now() then
    new_start := l.started_at;                            -- locked
  else
    select * into r from public.lot_class_range(p_lot);
    new_start := r.first_class;
  end if;
  new_exp := case when new_start is null then null else public.compute_expiry(new_start, l.validity_days) end;
  if new_start is distinct from l.started_at or new_exp is distinct from l.expires_at then
    update public.credit_lots set started_at = new_start, expires_at = new_exp where id = p_lot;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Credit primitives (validity-aware)
-- ---------------------------------------------------------------------------
drop function if exists public.grant_lot(uuid, public.credit_kind, int, timestamptz, text, uuid, uuid, timestamptz, public.ledger_entry, uuid);
create or replace function public.grant_lot(
  p_profile uuid, p_kind public.credit_kind, p_credits int, p_expires timestamptz, p_note text,
  p_payment uuid default null, p_membership uuid default null, p_period_start timestamptz default null,
  p_entry public.ledger_entry default 'grant', p_actor uuid default null, p_validity_days int default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  lot uuid;
begin
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, payment_id, note, membership_id, period_start, validity_days)
    values (p_profile, p_kind, p_credits, p_credits, case when p_validity_days is null then p_expires end, p_payment, p_note, p_membership, p_period_start, p_validity_days)
    on conflict (membership_id, period_start) where membership_id is not null do nothing
    returning id into lot;
  if lot is null then return null; end if;
  insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
    values (p_profile, lot, p_kind, p_credits, p_entry, p_note, p_actor);
  return lot;
end $$;

-- Is this lot usable for a class at p_class? (respects provisional/locked expiry)
create or replace function public.lot_usable_for(p_lot public.credit_lots, p_class timestamptz) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  st timestamptz;
  exp timestamptz;
begin
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
    if total_any >= p_cost then raise exception 'beyond_expiry' using errcode = 'P0001'; end if;
    raise exception 'no_credits' using errcode = 'P0001';
  end if;

  perform public.recalc_lot_expiry(t) from unnest(touched) t;
  return first_lot;
end $$;

-- Refund reverses debits to the same lots, then recalculates provisional expiry.
create or replace function public.return_credit(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  kind public.credit_kind;
  cost int;
  d record;
begin
  select * into b from public.bookings where id = p_booking;
  select ct.credit_kind, ct.credit_cost into kind, cost
    from public.class_sessions s join public.class_types ct on ct.id = s.class_type_id where s.id = b.session_id;

  if b.paid_with = 'credit' then
    for d in select lot_id, credit_kind, sum(delta) as spent from public.credit_ledger
              where booking_id = b.id and entry_type in ('booking_debit', 'cancel_refund') and lot_id is not null
              group by lot_id, credit_kind having sum(delta) < 0
    loop
      update public.credit_lots set remaining = remaining - d.spent where id = d.lot_id;
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, booking_id, note)
        values (b.profile_id, d.lot_id, d.credit_kind, -d.spent, 'cancel_refund', b.id, p_reason);
      perform public.recalc_lot_expiry(d.lot_id);
    end loop;
  elsif b.paid_with = 'payment' then
    if kind is null then
      update public.payments set status = 'needs_refund' where id = b.payment_id and status = 'paid';
    else
      perform public.grant_lot(b.profile_id, kind, cost, now() + interval '30 days', 'Credit for cancelled class', b.payment_id, null, null, 'cancel_refund');
    end if;
  elsif b.paid_with = 'pay_at_studio' then
    update public.payments set status = 'cancelled' where id = b.payment_id and status = 'pending';
  end if;
end $$;

-- Booking: also refuse classes on closure days.
create or replace function public.is_closed_on(p_at timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.closures c
                  where c.confirmed and (p_at at time zone (public.settings()).timezone)::date between c.starts_on and c.ends_on)
$$;

create or replace function public.guard_closed_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('held', 'confirmed') and new.source = 'online'
     and public.is_closed_on((select starts_at from public.class_sessions where id = new.session_id)) then
    raise exception 'studio_closed' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bookings_not_on_closures before insert on public.bookings
  for each row execute function public.guard_closed_booking();

-- Packs: credits granted "not yet started"; validity runs from the first class.
create or replace function public.confirm_payment(p_payment uuid, p_provider_ref text default null, p_method text default 'online')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  b public.bookings;
  s public.class_sessions;
  prod public.products;
  m public.memberships;
  lot_id uuid;
  start_at timestamptz;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p.status = 'paid' then return jsonb_build_object('status', 'already_paid', 'booking_id', p.booking_id); end if;
  if p.status in ('cancelled', 'refunded') then raise exception 'payment_cancelled' using errcode = 'P0001'; end if;

  update public.payments set status = 'paid', paid_at = now(), method = p_method,
         provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p.id;

  if p.purpose = 'pack' then
    select * into prod from public.products where id = p.product_id;
    lot_id := public.grant_lot(p.profile_id, prod.credit_kind, prod.credits, null, prod.name, p.id,
                               null, null, 'grant', null, prod.validity_days);
    return jsonb_build_object('status', 'credits_added', 'lot_id', lot_id);
  end if;

  if p.purpose in ('membership', 'renewal') then
    select * into prod from public.products where id = p.product_id;
    if p.membership_id is null then
      insert into public.memberships (profile_id, product_id, provider, current_period_start, current_period_end)
        values (p.profile_id, prod.id, case when p.provider = 'stripe' then 'stripe' else 'offline' end, now(), public.period_end(now(), prod.period_days))
        returning * into m;
      update public.payments set membership_id = m.id where id = p.id;
      start_at := m.current_period_start;
    else
      select * into m from public.memberships where id = p.membership_id;
      start_at := greatest(m.current_period_end, now());
      if p.purpose = 'membership' then start_at := m.current_period_start; end if;
    end if;
    lot_id := public.grant_membership_period(m.id, start_at, p.id);
    return jsonb_build_object('status', 'membership_active', 'membership_id', m.id, 'lot_id', lot_id);
  end if;

  select * into b from public.bookings where id = p.booking_id for update;
  select * into s from public.class_sessions where id = b.session_id for update;
  if b.status = 'confirmed' then
    update public.bookings set paid_with = 'payment', payment_id = p.id where id = b.id and paid_with = 'pay_at_studio';
    return jsonb_build_object('status', 'confirmed', 'booking_id', b.id);
  end if;
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
  update public.bookings set status = 'expired', payment_id = p.id where id = b.id;
  update public.payments set status = 'needs_refund' where id = p.id;
  return jsonb_build_object('status', 'needs_refund', 'booking_id', b.id);
end $$;

-- Confirming a closure: extend every started package overlapping it (ledger
-- 'freeze_extension'). Cancelling the classes (with notifications) is done by the app.
create or replace function public.apply_closure(p_closure uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  l public.credit_lots;
  old_exp timestamptz;
  new_exp timestamptz;
  c public.closures;
  n int := 0;
begin
  update public.closures set confirmed = true where id = p_closure returning * into c;
  for l in select * from public.credit_lots
            where validity_days is not null and started_at is not null and remaining > 0
              and expires_at > ((c.starts_on)::timestamp at time zone (public.settings()).timezone)
            for update
  loop
    old_exp := l.expires_at;
    perform public.recalc_lot_expiry(l.id);
    select expires_at into new_exp from public.credit_lots where id = l.id;
    if new_exp > old_exp then
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note)
        values (l.profile_id, l.id, l.credit_kind, 0, 'freeze_extension',
                c.name || ': +' || extract(day from new_exp - old_exp)::int || ' days');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Unpaid package requests expire after N hours.
create or replace function public.expire_unpaid_requests() returns setof uuid
language sql security definer set search_path = public as $$
  update public.payments set status = 'cancelled'
   where status = 'pending' and provider = 'offline' and booking_id is null
     and created_at < now() - make_interval(hours => (public.settings()).unpaid_request_expiry_hours)
  returning id
$$;

-- Usable balance; next_expiry ignores not-yet-started lots.
create or replace function public.credit_balance(p_profile uuid)
returns table (credit_kind public.credit_kind, remaining int, next_expiry timestamptz)
language sql stable security definer set search_path = public as $$
  select l.credit_kind, sum(l.remaining)::int, min(l.expires_at)
    from public.credit_lots l
   where l.profile_id = p_profile and l.remaining > 0 and (l.expires_at is null or l.expires_at > now())
   group by l.credit_kind
$$;

-- Classes usable for a given class time (respects validity from first class).
create or replace function public.usable_credits(p_profile uuid, p_kind public.credit_kind, p_class timestamptz)
returns table (usable int, total int, latest_expiry timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.remaining) filter (where public.lot_usable_for(l, p_class)), 0)::int,
         coalesce(sum(l.remaining), 0)::int,
         max(l.expires_at)
    from public.credit_lots l
   where l.profile_id = p_profile and l.credit_kind = p_kind and l.remaining > 0 and (l.expires_at is null or l.expires_at > now())
$$;

-- Cyprus public holidays (next 12 months) as suggestions to confirm.
-- Dates should be checked against the official calendar each year.
insert into public.closures (name, starts_on, ends_on, suggested) values
  ('Ochi Day', '2026-10-28', '2026-10-28', true),
  ('Christmas Day', '2026-12-25', '2026-12-25', true),
  ('Boxing Day', '2026-12-26', '2026-12-26', true),
  ('New Year''s Day', '2027-01-01', '2027-01-01', true),
  ('Epiphany', '2027-01-06', '2027-01-06', true),
  ('Green Monday', '2027-03-15', '2027-03-15', true),
  ('Greek Independence Day', '2027-03-25', '2027-03-25', true),
  ('Cyprus National Day', '2027-04-01', '2027-04-01', true),
  ('Orthodox Good Friday', '2027-04-30', '2027-04-30', true),
  ('Labour Day', '2027-05-01', '2027-05-01', true),
  ('Orthodox Easter Monday', '2027-05-03', '2027-05-03', true),
  ('Orthodox Easter Tuesday', '2027-05-04', '2027-05-04', true),
  ('Kataklysmos (Pentecost Monday)', '2027-06-21', '2027-06-21', true),
  ('Assumption Day', '2027-08-15', '2027-08-15', true),
  ('Cyprus Independence Day', '2027-10-01', '2027-10-01', true)
on conflict do nothing;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_profile_id() to authenticated;
grant execute on function public.session_availability(timestamptz, timestamptz) to anon, authenticated;
grant execute on all functions in schema public to service_role;
