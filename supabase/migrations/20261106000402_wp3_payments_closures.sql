-- WP3 (A-006, A-007, A-038): Mark as paid records a fee for a late-cancelled / missed class without re-booking;
-- trial and drop-in products can't be paid as a package; reward classes are granted inside confirm_payment;
-- closures and "cancel today" cancel their classes all-or-nothing.

-- ── A-006, A-007, A-038: confirm_payment v4 ─────────────────────────────────────────────
create or replace function public.confirm_payment(p_payment uuid, p_provider_ref text default null, p_method text default 'online') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p public.payments;
  b public.bookings;
  s public.class_sessions;
  prod public.products;
  m public.memberships;
  dc public.discount_codes;
  lot_id uuid;
  start_at timestamptz;
  extra int := 0;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p.status = 'paid' then return jsonb_build_object('status', 'already_paid', 'booking_id', p.booking_id); end if;
  if p.status in ('cancelled', 'refunded') then raise exception 'payment_cancelled' using errcode = 'P0001'; end if;

  if p.purpose = 'pack' then
    select * into prod from public.products where id = p.product_id;
    -- A-007: trials and drop-ins are single classes, never a package of credits.
    if not found or prod.tag not in ('package', 'membership') or prod.credit_kind is null then
      raise exception 'not_a_package' using errcode = 'P0001';
    end if;
  end if;

  update public.payments set status = 'paid', paid_at = now(), method = p_method,
         provider_ref = coalesce(p_provider_ref, provider_ref)
   where id = p.id;

  if p.purpose = 'pack' then
    lot_id := public.grant_lot(p.profile_id, prod.credit_kind, prod.credits, null, prod.name, p.id,
                               null, null, 'grant', null, prod.validity_days);
    -- A-038: a "free classes" reward or code goes onto this package in the same transaction (once).
    if p.discount_code_id is not null then
      select * into dc from public.discount_codes where id = p.discount_code_id;
      if found and dc.kind = 'free_classes' and dc.value > 0 then
        perform public.admin_adjust_lot(lot_id, 'add', 0, null, dc.value,
          case when dc.profile_id is not null then 'Reward' else 'Code ' || dc.code end || ': ' ||
          dc.value || ' free class' || case when dc.value = 1 then '' else 'es' end, null);
        extra := dc.value;
      end if;
    end if;
    return jsonb_build_object('status', 'credits_added', 'lot_id', lot_id, 'extra', extra);
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
  -- A-006: a fee for a class they cancelled late, missed or that is over: record the money, never re-book.
  if b.status in ('late_cancelled', 'no_show', 'cancelled', 'studio_cancelled') then
    update public.bookings set paid_with = 'payment', payment_id = p.id where id = b.id;
    return jsonb_build_object('status', 'fee_paid', 'booking_id', b.id);
  end if;
  -- Only a lapsed hold (online checkout paid after the hold ran out) is re-confirmed, if there's still room.
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

-- ── A-038: cancel several classes, or confirm a closure, all-or-nothing ─────────────────
-- Returns who to tell (only people who had a confirmed booking). Classes already cancelled are skipped.
create or replace function public.cancel_sessions(p_sessions uuid[], p_reason text)
returns table (session_id uuid, booking_id uuid, profile_id uuid)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  sid uuid;
  r record;
begin
  for sid in select x.id from public.class_sessions x
              where x.id = any(p_sessions) and x.status = 'scheduled' order by x.starts_at
  loop
    for r in select * from public.cancel_session(sid, p_reason) loop
      session_id := sid; booking_id := r.booking_id; profile_id := r.profile_id;
      return next;
    end loop;
  end loop;
end $$;

create or replace function public.confirm_closure(p_closure uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.closures;
  tz text := (public.settings()).timezone;
  ids uuid[];
  people jsonb;
  frozen int;
begin
  select * into c from public.closures where id = p_closure for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  select coalesce(array_agg(s.id), '{}') into ids from public.class_sessions s
   where s.status = 'scheduled'
     and s.starts_at >= (c.starts_on::timestamp at time zone tz)
     and s.starts_at < ((c.ends_on + 1)::timestamp at time zone tz);
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into people
    from public.cancel_sessions(ids, 'The studio is closed (' || c.name || ').') x;
  frozen := public.apply_closure(p_closure);
  return jsonb_build_object('classes', cardinality(ids), 'frozen', frozen, 'people', people);
end $$;

revoke all on function public.cancel_sessions(uuid[], text), public.confirm_closure(uuid) from public, anon, authenticated;
grant execute on function public.cancel_sessions(uuid[], text), public.confirm_closure(uuid) to service_role;
