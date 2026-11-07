-- WP12 time fixes (A-036, A-047, A-080, A-096): package ends move by calendar days in studio time,
-- never by 24-hour steps, so a clock change can't push an end off local midnight.

-- Same wall-clock time, n calendar days later, in the studio's timezone.
create or replace function public.add_local_days(p_ts timestamptz, p_days int) returns timestamptz
language sql stable set search_path = public as $$
  select (((p_ts at time zone z.tz)::date + p_days)::timestamp + (p_ts at time zone z.tz)::time) at time zone z.tz
    from (select (public.settings()).timezone as tz) z
$$;
revoke execute on function public.add_local_days(timestamptz, int) from public, anon, authenticated;
grant execute on function public.add_local_days(timestamptz, int) to service_role;

-- admin_adjust_lot v4: calendar-day extend and freeze (A-047), a freeze doesn't count days a confirmed
-- closure already extends (A-080), and more than 366 days of validity is refused as bad_days (A-036).
create or replace function public.admin_adjust_lot(
  p_lot uuid, p_action text, p_days int, p_date date, p_credits int, p_reason text, p_actor uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  l public.credit_lots;
  tz text := (public.settings()).timezone;
  new_end timestamptz;
  eff int;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  select * into l from public.credit_lots where id = p_lot for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

  if p_action = 'freeze' then
    if p_date is null or coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_days' using errcode = 'P0001'; end if;
    if exists (select 1 from public.credit_ledger g join public.bookings b on b.id = g.booking_id
                 join public.class_sessions s on s.id = b.session_id
                where g.lot_id = l.id and g.entry_type = 'booking_debit' and b.status = 'confirmed'
                  and (s.starts_at at time zone tz)::date between p_date and p_date + p_days - 1) then
      raise exception 'booked_in_freeze' using errcode = 'P0001';
    end if;
    -- A package counted from its first class already extends by confirmed closure days; count those once.
    eff := case when l.validity_days is not null then greatest(p_days - public.closed_days(p_date, p_date + p_days), 0) else p_days end;
    if l.validity_days is not null and l.validity_days + eff > 366 then raise exception 'bad_days' using errcode = 'P0001'; end if;
    insert into public.lot_freezes (lot_id, starts_on, ends_on, reason) values (l.id, p_date, p_date + p_days - 1, p_reason);
    if l.validity_days is not null then
      update public.credit_lots set validity_days = validity_days + eff where id = l.id;
      perform public.recalc_lot_expiry(l.id);
    elsif l.expires_at is not null then
      update public.credit_lots set expires_at = public.add_local_days(expires_at, eff) where id = l.id;
    end if;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, 0, 'freeze_extension',
              format('Frozen %s – %s', to_char(p_date, 'DD.MM.YYYY'), to_char(p_date + p_days - 1, 'DD.MM.YYYY')) || ': ' || p_reason, p_actor);

  elsif p_action = 'extend' then
    if coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_days' using errcode = 'P0001'; end if;
    if l.validity_days is not null then
      if l.validity_days + p_days > 366 then raise exception 'bad_days' using errcode = 'P0001'; end if;
      update public.credit_lots set validity_days = validity_days + p_days where id = l.id;
      perform public.recalc_lot_expiry(l.id);
    elsif l.expires_at is not null then
      update public.credit_lots set expires_at = public.add_local_days(expires_at, p_days) where id = l.id;
    else
      raise exception 'no_end_date' using errcode = 'P0001';
    end if;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, 0, 'admin_adjustment', format('Extended %s days', p_days) || ': ' || p_reason, p_actor);

  elsif p_action = 'end' then
    if p_date is null then raise exception 'bad_date' using errcode = 'P0001'; end if;
    new_end := (p_date + 1)::timestamp at time zone tz;
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
revoke execute on function public.admin_adjust_lot(uuid, text, int, date, int, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_lot(uuid, text, int, date, int, text, uuid) to service_role;

-- apply_closure: the ledger note counts local calendar days (A-096).
create or replace function public.apply_closure(p_closure uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  l public.credit_lots;
  old_exp timestamptz;
  new_exp timestamptz;
  c public.closures;
  tz text := (public.settings()).timezone;
  n int := 0;
begin
  update public.closures set confirmed = true where id = p_closure returning * into c;
  for l in select * from public.credit_lots
            where validity_days is not null and started_at is not null and remaining > 0
              and expires_at > ((c.starts_on)::timestamp at time zone tz)
            for update
  loop
    old_exp := l.expires_at;
    perform public.recalc_lot_expiry(l.id);
    select expires_at into new_exp from public.credit_lots where id = l.id;
    if new_exp > old_exp then
      insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note)
        values (l.profile_id, l.id, l.credit_kind, 0, 'freeze_extension',
                c.name || ': +' || ((new_exp at time zone tz)::date - (old_exp at time zone tz)::date) || ' days');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- admin_adjust_credits: "N days" means through the Nth day from today, ending at local midnight.
create or replace function public.admin_adjust_credits(p_profile uuid, p_kind public.credit_kind, p_delta int, p_days int, p_reason text, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare tz text := (public.settings()).timezone;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'reason_required' using errcode = 'P0001'; end if;
  if p_delta > 0 then
    perform public.grant_lot(p_profile, p_kind, p_delta,
      case when p_days > 0 then ((((now() at time zone tz)::date + p_days + 1)::timestamp) at time zone tz) end, p_reason, null, null, null, 'admin_adjustment', p_actor);
  elsif p_delta < 0 then
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
revoke execute on function public.admin_adjust_credits(uuid, public.credit_kind, int, int, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_credits(uuid, public.credit_kind, int, int, text, uuid) to service_role;

-- return_credit: the replacement credit for a cancelled paid class lasts 30 calendar days (through that day).
create or replace function public.return_credit(p_booking uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  kind public.credit_kind;
  cost int;
  d record;
  tz text := (public.settings()).timezone;
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
      perform public.grant_lot(b.profile_id, kind, cost, (((now() at time zone tz)::date + 31)::timestamp) at time zone tz, 'Credit for cancelled class', b.payment_id, null, null, 'cancel_refund');
    end if;
  elsif b.paid_with = 'pay_at_studio' then
    update public.payments set status = 'cancelled' where id = b.payment_id and status = 'pending';
  end if;
end $$;
revoke execute on function public.return_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.return_credit(uuid, text) to service_role;

-- resume_membership: the paused time is added as whole calendar days plus the part of a day left over.
create or replace function public.resume_membership(p_membership uuid) returns interval
language plpgsql security definer set search_path = public as $$
declare
  m public.memberships;
  gap interval;
  gap_days int;
begin
  select * into m from public.memberships where id = p_membership and status = 'paused' for update;
  if not found then return interval '0'; end if;
  gap := now() - m.paused_at;
  gap_days := floor(extract(epoch from gap) / 86400)::int;
  update public.memberships set status = 'active', paused_at = null, current_period_end = public.add_local_days(current_period_end, gap_days) + (gap - make_interval(hours => gap_days * 24)) where id = m.id;
  update public.credit_lots set expires_at = public.add_local_days(expires_at, gap_days) + (gap - make_interval(hours => gap_days * 24))
   where membership_id = m.id and period_start = m.current_period_start and expires_at is not null;
  return gap;
end $$;
revoke execute on function public.resume_membership(uuid) from public, anon, authenticated;
grant execute on function public.resume_membership(uuid) to service_role;
