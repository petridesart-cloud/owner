-- Bug fixes after review.

-- 1. The repeating timetable brought back classes she had cancelled or moved: the duplicate guard
--    (class_sessions_no_dupe) only covers scheduled classes, and topping up regenerated the whole range.
--    Now a top-up only adds the new days, and never creates a class where one of that type already
--    exists at that time (cancelled included).
create or replace function public.generate_sessions_range(p_template uuid, p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare
  t public.timetable_templates;
  tz text := (public.settings()).timezone;
  n int;
begin
  select * into t from public.timetable_templates where id = p_template;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

  with days as (
    select d::date as day from generate_series(greatest(p_from, t.valid_from), least(p_to, t.valid_to), interval '1 day') d
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
    select r.class_type_id, t.id, r.starts_at, r.starts_at + make_interval(mins => r.dur), r.cap
      from rows r
     where r.starts_at > now() and not public.is_closed_on(r.starts_at)
       and not exists (select 1 from public.class_sessions x where x.class_type_id = r.class_type_id and x.starts_at = r.starts_at)
    on conflict do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

create or replace function public.generate_sessions(p_template uuid) returns int
language sql security definer set search_path = public as $$
  select public.generate_sessions_range(p_template, valid_from, valid_to) from public.timetable_templates where id = p_template
$$;

create or replace function public.extend_timetable(p_days int default 63) returns int
language plpgsql security definer set search_path = public as $$
declare
  t public.timetable_templates;
  horizon date := (now() at time zone (public.settings()).timezone)::date + p_days;
begin
  select * into t from public.timetable_templates where repeats order by created_at desc limit 1;
  if not found or t.valid_to >= horizon then return 0; end if;
  update public.timetable_templates set valid_to = horizon where id = t.id;
  return public.generate_sessions_range(t.id, t.valid_to + 1, horizon);  -- only the new days
end $$;

revoke execute on function public.generate_sessions_range(uuid, date, date) from public, anon, authenticated;
grant execute on function public.generate_sessions_range(uuid, date, date) to service_role;

-- 2. The studio couldn't open a clients-only event in "Client view"; and only events can be clients-only.
create or replace function public.can_access_event(p_profile uuid, p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  -- Only events can be clients-only (a stray tick on a regular class must never block bookings or the waitlist).
  select not coalesce((select s.clients_only and t.kind = 'event' from public.class_sessions s
                         join public.class_types t on t.id = s.class_type_id where s.id = p_session), false)
      or (p_profile is not null and (
            exists (select 1 from public.profiles where id = p_profile and role = 'admin')
         or public.is_studio_client(p_profile)
         or exists (select 1 from public.event_access where session_id = p_session and profile_id = p_profile)
         or exists (select 1 from public.bookings where session_id = p_session and profile_id = p_profile and status = 'confirmed')))
$$;

-- 3. "Extend" on classes with no end date logged an extension that changed nothing.
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

  if p_action in ('extend', 'freeze') then
    if coalesce(p_days, 0) < 1 or p_days > 365 then raise exception 'bad_days' using errcode = 'P0001'; end if;
    -- Packages counted from the first class keep that rule: they just get more days.
    if l.validity_days is not null then
      update public.credit_lots set validity_days = validity_days + p_days where id = l.id;
      perform public.recalc_lot_expiry(l.id);
    elsif l.expires_at is not null then
      update public.credit_lots set expires_at = expires_at + make_interval(days => p_days) where id = l.id;
    else
      raise exception 'no_end_date' using errcode = 'P0001';  -- nothing to extend: these classes never expire
    end if;
    note := case when p_action = 'freeze' then format('Frozen %s days', p_days) || coalesce(' from ' || to_char(p_date, 'DD.MM.YYYY'), '')
                 else format('Extended %s days', p_days) end;
    insert into public.credit_ledger (profile_id, lot_id, credit_kind, delta, entry_type, note, actor_profile_id)
      values (l.profile_id, l.id, l.credit_kind, 0, case when p_action = 'freeze' then 'freeze_extension' else 'admin_adjustment' end::public.ledger_entry,
              note || ': ' || p_reason, p_actor);

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

-- 4. Erasing an account also removes its event access.
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
  update public.payments set status = 'cancelled' where profile_id = p_profile and status = 'pending';
  delete from public.health_notes where profile_id = p_profile;
  delete from public.health_history where profile_id = p_profile;
  delete from public.event_access where profile_id = p_profile;
  delete from public.recurring_rules where profile_id = p_profile;
  update public.profiles set full_name = 'Deleted client', first_name = null, last_name = null, email = null, phone = null,
         date_of_birth = null, parq_completed_at = null, goal = null, emergency_contact_name = null, emergency_contact_phone = null,
         emergency_contact_relation = null, photo_consent = null,
         admin_notes = null, marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;
  update public.notifications set recipient = '[erased]', body = '[erased]' where profile_id = p_profile;
  return uid; -- caller deletes the auth user
end $$;
