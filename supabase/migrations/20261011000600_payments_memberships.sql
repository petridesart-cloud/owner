-- Payments behind a flag (pay at the studio while unregistered), monthly packages
-- (memberships), append-only credit ledger with typed entries, per-class credit cost.

-- ---------------------------------------------------------------------------
-- Types & columns
-- ---------------------------------------------------------------------------
alter type public.paid_with add value if not exists 'pay_at_studio';
alter type public.product_kind add value if not exists 'membership';
create type public.membership_status as enum ('active', 'paused', 'past_due', 'cancelled', 'expired');
create type public.ledger_entry as enum ('grant', 'booking_debit', 'cancel_refund', 'expiry', 'admin_adjustment', 'rollover');

alter table public.studio_settings
  add column online_payments_enabled boolean not null default false,
  add column allow_pay_later boolean not null default true,
  add column membership_period_mode text not null default 'rolling' check (membership_period_mode in ('rolling', 'calendar')),
  add column rollover_max int not null default 0 check (rollover_max between 0 and 50),
  add column trader_name text not null default '[Owner full name]';
-- Not registered yet: trading name only; VAT/registration stay empty and hidden.
alter table public.studio_settings alter column legal_name set default 'Re·Form Pilates Studio';
update public.studio_settings set legal_name = 'Re·Form Pilates Studio', registration_number = '', vat_number = '', vat_registered = false;
alter table public.studio_settings alter column registration_number set default '';
alter table public.studio_settings alter column vat_number set default '';

alter table public.class_types add column credit_cost int not null default 1 check (credit_cost between 1 and 10);

alter table public.products
  add column period_days int check (period_days between 7 and 366),
  add column description text;

alter table public.profiles add column stripe_customer_id text unique;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id),
  next_product_id uuid references public.products(id),        -- change applies from the next period
  status public.membership_status not null default 'active',
  provider text not null default 'offline' check (provider in ('offline', 'stripe')),
  provider_subscription_id text unique,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  paused_at timestamptz,
  created_at timestamptz not null default now()
);
create index memberships_profile_idx on public.memberships (profile_id, status);
create unique index memberships_one_live on public.memberships (profile_id) where status in ('active', 'paused', 'past_due');

alter table public.credit_lots
  add column membership_id uuid references public.memberships(id) on delete set null,
  add column period_start timestamptz;
create unique index credit_lots_one_per_period on public.credit_lots (membership_id, period_start) where membership_id is not null;

alter table public.payments
  add column method text check (method in ('online', 'cash', 'card_in_person', 'bank_transfer')),
  add column membership_id uuid references public.memberships(id) on delete set null;
alter table public.payments drop constraint if exists payments_purpose_check;
alter table public.payments add constraint payments_purpose_check check (purpose in ('booking', 'pack', 'membership', 'renewal'));

-- Stripe webhook idempotency
create table public.processed_webhooks (id text primary key, created_at timestamptz not null default now());

-- Ledger: typed entries, a note, and append-only.
alter table public.credit_ledger rename column reason to entry_type_old;
alter table public.credit_ledger add column entry_type public.ledger_entry, add column note text, add column actor_profile_id uuid references public.profiles(id) on delete set null;
update public.credit_ledger set entry_type = case entry_type_old
  when 'purchase' then 'grant' when 'import' then 'grant' when 'booking' then 'booking_debit'
  when 'admin_adjust' then 'admin_adjustment' else 'cancel_refund' end::public.ledger_entry,
  note = entry_type_old;
alter table public.credit_ledger drop column entry_type_old;
alter table public.credit_ledger alter column entry_type set not null;
alter table public.credit_ledger add constraint ledger_admin_reason check (entry_type <> 'admin_adjustment' or coalesce(trim(note), '') <> '');

create or replace function public.ledger_append_only() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('reform.ledger_maintenance', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  raise exception 'credit_ledger is append-only';
end $$;
create trigger credit_ledger_append_only before update or delete on public.credit_ledger
  for each row execute function public.ledger_append_only();

alter table public.memberships enable row level security;
alter table public.processed_webhooks enable row level security;
create policy "own memberships" on public.memberships for select to authenticated
  using (profile_id = public.my_profile_id() or public.is_admin());
revoke insert, update, delete on public.memberships from anon, authenticated;
revoke all on public.processed_webhooks from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Credit primitives. credit_lots.remaining is a cache kept in lock-step with the
-- ledger by these functions only; the ledger is the source of truth.
-- ---------------------------------------------------------------------------
create or replace function public.grant_lot(
  p_profile uuid, p_kind public.credit_kind, p_credits int, p_expires timestamptz, p_note text,
  p_payment uuid default null, p_membership uuid default null, p_period_start timestamptz default null,
  p_entry public.ledger_entry default 'grant', p_actor uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  lot uuid;
begin
  insert into public.credit_lots (profile_id, credit_kind, total, remaining, expires_at, payment_id, note, membership_id, period_start)
    values (p_profile, p_kind, p_credits, p_credits, p_expires, p_payment, p_note, p_membership, p_period_start)
    on conflict (membership_id, period_start) where membership_id is not null do nothing
    returning id into lot;
  if lot is null then return null; end if; -- already granted for this period (idempotent)
  insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
    values (p_profile, lot, p_kind, p_credits, p_entry, p_note, p_actor);
  return lot;
end $$;

-- Spend credits oldest-expiring first, possibly across several lots. Locks the lots.
create or replace function public.spend_credits(p_profile uuid, p_kind public.credit_kind, p_cost int, p_booking uuid, p_valid_at timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  need int := p_cost;
  lot record;
  take int;
  first_lot uuid;
  available int;
begin
  select coalesce(sum(remaining), 0) into available from public.credit_lots
   where profile_id = p_profile and credit_kind = p_kind and remaining > 0 and (expires_at is null or expires_at > p_valid_at);
  if available < p_cost then raise exception 'no_credits' using errcode = 'P0001'; end if;

  for lot in select id, remaining from public.credit_lots
              where profile_id = p_profile and credit_kind = p_kind and remaining > 0
                and (expires_at is null or expires_at > p_valid_at)
              order by expires_at nulls last, created_at
              for update
  loop
    exit when need = 0;
    take := least(need, lot.remaining);
    update public.credit_lots set remaining = remaining - take where id = lot.id;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, booking_id)
      values (p_profile, lot.id, p_kind, -take, 'booking_debit', p_booking);
    first_lot := coalesce(first_lot, lot.id);
    need := need - take;
  end loop;
  if need > 0 then raise exception 'no_credits' using errcode = 'P0001'; end if;
  return first_lot;
end $$;

-- Expire unused credits (ledger 'expiry' entries). Run from the periodic tick.
create or replace function public.expire_credits() returns int
language plpgsql security definer set search_path = public as $$
declare
  lot record;
  n int := 0;
begin
  for lot in select * from public.credit_lots where remaining > 0 and expires_at is not null and expires_at <= now() for update skip locked
  loop
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note)
      values (lot.profile_id, lot.id, lot.credit_kind, -lot.remaining, 'expiry', lot.note);
    update public.credit_lots set remaining = 0 where id = lot.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.admin_adjust_credits(p_profile uuid, p_kind public.credit_kind, p_delta int, p_days int, p_reason text, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_delta > 0 then
    perform public.grant_lot(p_profile, p_kind, p_delta,
      case when p_days > 0 then now() + make_interval(days => p_days) end, p_reason, null, null, null, 'admin_adjustment', p_actor);
  elsif p_delta < 0 then
    -- Remove from the soonest-expiring lots.
    declare need int := -p_delta; lot record; take int;
    begin
      for lot in select id, remaining from public.credit_lots
                  where profile_id = p_profile and credit_kind = p_kind and remaining > 0 and (expires_at is null or expires_at > now())
                  order by expires_at nulls last for update
      loop
        exit when need = 0;
        take := least(need, lot.remaining);
        update public.credit_lots set remaining = remaining - take where id = lot.id;
        insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
          values (p_profile, lot.id, p_kind, -take, 'admin_adjustment', p_reason, p_actor);
        need := need - take;
      end loop;
      if need > 0 then raise exception 'not_enough_credits' using errcode = 'P0001'; end if;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Refunds: reverse a booking's debits back to the same lots (original expiry).
-- ---------------------------------------------------------------------------
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
    end loop;
  elsif b.paid_with = 'payment' then
    if kind is null then
      update public.payments set status = 'needs_refund' where id = b.payment_id and status = 'paid';
    else
      -- Paid for a single class: becomes class credit(s) of that type, valid 30 days.
      perform public.grant_lot(b.profile_id, kind, cost, now() + interval '30 days', 'Credit for cancelled class', b.payment_id, null, null, 'cancel_refund');
    end if;
  elsif b.paid_with = 'pay_at_studio' then
    update public.payments set status = 'cancelled' where id = b.payment_id and status = 'pending';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Booking (adds per-class credit cost and pay-at-studio)
-- ---------------------------------------------------------------------------
create or replace function public.book_session(
  p_profile uuid, p_session uuid, p_mode text, p_source public.booking_source default 'online'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.class_sessions;
  ct public.class_types;
  cfg public.studio_settings := public.settings();
  new_id uuid;
  first_lot uuid;
  pay_id uuid;
  st public.booking_status;
begin
  select * into s from public.class_sessions where id = p_session for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if s.status <> 'scheduled' then raise exception 'class_cancelled' using errcode = 'P0001'; end if;
  if p_source = 'online' and s.starts_at <= now() then raise exception 'class_started' using errcode = 'P0001'; end if;
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
  elsif p_mode = 'pay_at_studio' then
    if p_source = 'online' then
      if not cfg.allow_pay_later then raise exception 'pay_later_off' using errcode = 'P0001'; end if;
      -- At most one unpaid upcoming class at a time.
      if exists (select 1 from public.bookings b join public.class_sessions x on x.id = b.session_id
                  where b.profile_id = p_profile and b.status = 'confirmed' and b.paid_with = 'pay_at_studio' and x.ends_at > now()) then
        raise exception 'unpaid_limit' using errcode = 'P0001';
      end if;
    end if;
    insert into public.bookings (session_id, profile_id, status, source, paid_with, confirmed_at)
      values (p_session, p_profile, 'confirmed', p_source, 'pay_at_studio', now()) returning id into new_id;
    insert into public.payments (profile_id, provider, amount_cents, purpose, description, booking_id, status)
      values (p_profile, 'offline', coalesce(s.price_cents, ct.price_cents), 'booking',
              coalesce(s.title, ct.name) || ' · ' || to_char(s.starts_at at time zone cfg.timezone, 'Dy DD Mon HH24:MI'), new_id, 'pending')
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

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------
create or replace function public.period_end(p_start timestamptz, p_days int) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when (public.settings()).membership_period_mode = 'calendar'
              then (date_trunc('month', p_start at time zone (public.settings()).timezone) + interval '1 month') at time zone (public.settings()).timezone
              else p_start + make_interval(days => coalesce(p_days, 30)) end
$$;

-- Grant one period's credits (idempotent per membership + period start), with rollover.
create or replace function public.grant_membership_period(p_membership uuid, p_start timestamptz, p_payment uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m public.memberships;
  prod public.products;
  cfg public.studio_settings := public.settings();
  p_end timestamptz;
  lot uuid;
  prev public.credit_lots;
  carry int := 0;
begin
  select * into m from public.memberships where id = p_membership for update;
  -- A scheduled package change takes effect from this period.
  if m.next_product_id is not null and p_start >= m.current_period_end then
    update public.memberships set product_id = next_product_id, next_product_id = null where id = m.id returning * into m;
  end if;
  select * into prod from public.products where id = m.product_id;
  p_end := public.period_end(p_start, prod.period_days);

  lot := public.grant_lot(m.profile_id, prod.credit_kind, prod.credits, p_end, prod.name, p_payment, m.id, p_start);
  if lot is null then
    return (select id from public.credit_lots where membership_id = m.id and period_start = p_start);
  end if;

  -- Rollover: carry up to N unused credits from the previous period into this one.
  if cfg.rollover_max > 0 then
    select * into prev from public.credit_lots
     where membership_id = m.id and period_start < p_start and remaining > 0
     order by period_start desc limit 1 for update;
    if found then
      carry := least(prev.remaining, cfg.rollover_max);
      update public.credit_lots set remaining = remaining - carry where id = prev.id;
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note)
        values (m.profile_id, prev.id, prev.credit_kind, -carry, 'rollover', 'Rolled into next period');
      update public.credit_lots set remaining = remaining + carry, total = total + carry where id = lot;
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note)
        values (m.profile_id, lot, prev.credit_kind, carry, 'rollover', 'Rolled over from last period');
    end if;
  end if;

  update public.memberships
     set current_period_start = p_start, current_period_end = p_end,
         status = case when status in ('past_due', 'expired') then 'active' else status end
   where id = m.id;
  return lot;
end $$;

create or replace function public.pause_membership(p_membership uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.memberships set status = 'paused', paused_at = now() where id = p_membership and status = 'active';
end $$;

-- Resume: the period and its credits are extended by the time spent paused.
create or replace function public.resume_membership(p_membership uuid) returns interval
language plpgsql security definer set search_path = public as $$
declare
  m public.memberships;
  gap interval;
begin
  select * into m from public.memberships where id = p_membership and status = 'paused' for update;
  if not found then return interval '0'; end if;
  gap := now() - m.paused_at;
  update public.memberships set status = 'active', paused_at = null, current_period_end = current_period_end + gap where id = m.id;
  update public.credit_lots set expires_at = expires_at + gap
   where membership_id = m.id and period_start = m.current_period_start and expires_at is not null;
  return gap;
end $$;

-- ---------------------------------------------------------------------------
-- Payment confirmation (online webhook OR "Mark as paid" in the studio)
-- ---------------------------------------------------------------------------
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
    lot_id := public.grant_lot(p.profile_id, prod.credit_kind, prod.credits,
      case when prod.validity_days is null then null else now() + make_interval(days => prod.validity_days) end, prod.name, p.id);
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
      -- Renewal: next period starts when the current one ends (or now, if it has lapsed).
      start_at := greatest(m.current_period_end, now());
      if p.purpose = 'membership' then start_at := m.current_period_start; end if;
    end if;
    lot_id := public.grant_membership_period(m.id, start_at, p.id);
    return jsonb_build_object('status', 'membership_active', 'membership_id', m.id, 'lot_id', lot_id);
  end if;

  select * into b from public.bookings where id = p.booking_id for update;
  select * into s from public.class_sessions where id = b.session_id for update;

  if b.status = 'confirmed' then
    -- Pay-at-studio booking settled in person.
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

drop function if exists public.confirm_payment(uuid, text);

-- Late-fill refund now uses the ledger-based return_credit (unchanged signature).
-- Studio reset needs to clear the append-only ledger.
create or replace function public.reset_demo_data() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('reform.ledger_maintenance', 'on', true);
  delete from public.notifications where true;
  delete from public.waitlist_entries where true;
  delete from public.credit_ledger where true;
  update public.bookings set credit_lot_id = null, payment_id = null where true;
  update public.payments set booking_id = null, membership_id = null where true;
  delete from public.bookings where true;
  delete from public.credit_lots where true;
  delete from public.payments where true;
  delete from public.memberships where true;
  delete from public.class_sessions where true;
  delete from public.timetable_templates where true;
  delete from public.otp_requests where true;
  delete from public.processed_webhooks where true;
  delete from public.consents where profile_id in (select id from public.profiles where role = 'client');
  delete from public.profiles where role = 'client';
  delete from public.products where true;
  perform public.seed_demo();
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_profile_id() to authenticated;
grant execute on function public.session_availability(timestamptz, timestamptz) to anon, authenticated;
grant execute on all functions in schema public to service_role;
