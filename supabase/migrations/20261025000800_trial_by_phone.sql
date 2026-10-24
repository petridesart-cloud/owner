-- Trials: first class of a type only, now also matched by phone number so a new email
-- address doesn't give a second trial. One check used by the engine and the class page.

-- Last 8 digits (a Cyprus mobile without the +357 / 00357 prefix); null if too short.
create or replace function public.phone_key(p text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 8
              then right(regexp_replace(p, '\D', '', 'g'), 8) end
$$;

create or replace function public.trial_eligible(p_profile uuid, p_kind public.credit_kind) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  key text := (select public.phone_key(phone) from public.profiles where id = p_profile);
begin
  return not exists (
    select 1 from public.profiles who
     where (who.id = p_profile or (key is not null and public.phone_key(who.phone) = key))
       and (exists (select 1 from public.bookings b join public.class_sessions x on x.id = b.session_id
                     join public.class_types t on t.id = x.class_type_id
                     where b.profile_id = who.id and t.credit_kind = p_kind
                       and b.status in ('held', 'confirmed', 'late_cancelled', 'no_show'))
            or exists (select 1 from public.payments pm join public.products pr on pr.id = pm.product_id
                        where pm.profile_id = who.id and pr.tag = 'trial' and pr.credit_kind = p_kind
                          and pm.status in ('pending', 'paid'))));
end $$;

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

revoke execute on function public.phone_key(text), public.trial_eligible(uuid, public.credit_kind),
  public.book_session(uuid, uuid, text, public.booking_source, text) from public, anon, authenticated;
grant execute on function public.phone_key(text), public.trial_eligible(uuid, public.credit_kind),
  public.book_session(uuid, uuid, text, public.booking_source, text) to service_role;
