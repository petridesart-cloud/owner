-- Studio notes, round 1.

-- ── The timetable repeats by itself ─────────────────────────────────────────
-- The newest timetable keeps going: every tick tops classes up to ~9 weeks ahead.
-- She changes single classes by hand, or saves a new timetable from a date.
alter table public.timetable_templates add column repeats boolean not null default true;
update public.timetable_templates t set repeats = false
 where exists (select 1 from public.timetable_templates n where n.created_at > t.created_at);

-- Never create classes on confirmed closure days.
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
      from rows where starts_at > now() and not public.is_closed_on(starts_at)
    on conflict do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;

-- Called on every tick: keep the newest repeating timetable 9 weeks ahead.
create or replace function public.extend_timetable(p_days int default 63) returns int
language plpgsql security definer set search_path = public as $$
declare
  t public.timetable_templates;
  horizon date := (now() at time zone (public.settings()).timezone)::date + p_days;
begin
  select * into t from public.timetable_templates where repeats order by created_at desc limit 1;
  if not found or t.valid_to >= horizon then return 0; end if;
  update public.timetable_templates set valid_to = horizon where id = t.id;
  return public.generate_sessions(t.id);
end $$;

-- A new timetable takes over from its start date: older ones stop repeating, and their
-- empty future classes from that date are removed. Classes with anyone booked or waiting stay.
create or replace function public.replace_timetable_from(p_template uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  t public.timetable_templates;
  start_at timestamptz;
  kept int;
begin
  select * into t from public.timetable_templates where id = p_template;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  start_at := t.valid_from::timestamp at time zone (public.settings()).timezone;
  update public.timetable_templates set repeats = false, valid_to = least(valid_to, t.valid_from - 1)
   where id <> t.id and (repeats or valid_to >= t.valid_from);
  delete from public.class_sessions s
   where s.template_id is not null and s.template_id <> t.id and s.starts_at >= start_at and s.starts_at > now()
     and not exists (select 1 from public.bookings b where b.session_id = s.id)
     and not exists (select 1 from public.waitlist_entries w where w.session_id = s.id)
     and not exists (select 1 from public.media m where m.slot in ('event:' || s.id, 'event-cover:' || s.id));
  select count(*) into kept from public.class_sessions s
   where s.template_id is not null and s.template_id <> t.id and s.starts_at >= start_at and s.status = 'scheduled';
  return kept;
end $$;

revoke execute on function public.extend_timetable(int), public.replace_timetable_from(uuid) from public, anon, authenticated;
grant execute on function public.extend_timetable(int), public.replace_timetable_from(uuid) to service_role;

-- ── Clients ─────────────────────────────────────────────────────────────────
alter table public.profiles add column emergency_contact_relation text;

-- Every time a client saves their health answers, a copy is kept (newest first on her client page).
-- Special-category data: written by the server only, read by the studio only, erased with the account.
create table public.health_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conditions text[] not null default '{}',
  details text,
  pregnancy text,
  pregnancy_weeks int,
  postpartum_months int,
  bp_meds boolean,
  medication text,
  clearance_needed boolean not null default false,
  created_at timestamptz not null default now()
);
create index health_history_profile_idx on public.health_history (profile_id, created_at desc);
alter table public.health_history enable row level security;
revoke all on public.health_history from anon, authenticated;

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
  delete from public.recurring_rules where profile_id = p_profile;
  update public.profiles set full_name = 'Deleted client', first_name = null, last_name = null, email = null, phone = null,
         date_of_birth = null, parq_completed_at = null, goal = null, emergency_contact_name = null, emergency_contact_phone = null,
         emergency_contact_relation = null, photo_consent = null,
         admin_notes = null, marketing_email = false, marketing_sms = false, user_id = null, deleted_at = now()
   where id = p_profile;
  update public.notifications set recipient = '[erased]', body = '[erased]' where profile_id = p_profile;
  return uid; -- caller deletes the auth user
end $$;

-- ── Adjusting a package (Admin → client) ────────────────────────────────────
-- Every change is a ledger entry (delta 0 for date changes) so her history and the accountant see it.
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
revoke execute on function public.admin_adjust_lot(uuid, text, int, date, int, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_adjust_lot(uuid, text, int, date, int, text, uuid) to service_role;

-- ── Demo ────────────────────────────────────────────────────────────────────
-- Health notes state facts only (no instructions), and Maria has two saved versions of her answers.
create or replace function public.seed_demo_profiles() returns void
language sql security definer set search_path = public as $$
  update public.profiles set parq_completed_at = now()
   where role = 'client' and parq_completed_at is null and email like '%@example.com';
  update public.profiles
     set date_of_birth = date '1984-01-01' + (abs(hashtext(email)) % 8000)
   where role = 'client' and date_of_birth is null and email like '%@example.com';
  -- One demo client celebrates on the day of their next class (shows the Birthday flag).
  update public.profiles p
     set date_of_birth = make_date(1992, extract(month from x.d)::int, extract(day from x.d)::int)
    from (select (s.starts_at at time zone 'Europe/Nicosia')::date as d from public.bookings b
            join public.class_sessions s on s.id = b.session_id
            join public.profiles q on q.id = b.profile_id
           where q.email = 'elena@example.com' and b.status = 'confirmed' and s.starts_at > now()
           order by s.starts_at limit 1) x
   where p.email = 'elena@example.com' and not (extract(month from x.d) = 2 and extract(day from x.d) = 29);
  -- A demo client with health answers that need a doctor's note (shows the flag in her list).
  insert into public.health_notes (profile_id, conditions, details, pregnancy, pregnancy_weeks, bp_meds, clearance_needed, consent_at, updated_at)
  select id, '{pregnancy,back}', 'Lower back ache since the second trimester.', 'current', 20, false, true, now(), now()
    from public.profiles where email = 'maria@example.com'
  on conflict (profile_id) do update set conditions = excluded.conditions, details = excluded.details, pregnancy = excluded.pregnancy,
    pregnancy_weeks = excluded.pregnancy_weeks, bp_meds = excluded.bp_meds, clearance_needed = true, clearance_received_at = null;
  update public.class_sessions s
     set clients_only = (s.title = 'Brunch & Pilates'),
         what_to_bring = case when s.title = 'SUP Pilates' then E'Swimwear or comfy activewear\nTowel and water\nSunscreen' end,
         event_policy = case when s.title = 'SUP Pilates' then 'Weather permitting. If the sea is too rough we move the date and you keep your spot or get your money back. Cancel at least 48 hours before for a full refund.'
                             else 'Cancel at least 48 hours before for a full refund. After that the fee covers food ordered for you.' end,
         recap = case when s.starts_at < now() then 'Sunrise on the water with the loveliest group. Thank you for coming, see you at the next one.' end
    from public.class_types t
   where t.id = s.class_type_id and t.kind = 'event'
     and exists (select 1 from public.profiles where email = 'elena@example.com');
  -- One class a day for Maria, today and the next 4 weeks: the earliest regular class that still has room.
  insert into public.bookings (session_id, profile_id, status, paid_with, source)
  select x.id, m.id, 'confirmed', 'manual', 'manual'
    from public.profiles m
    cross join lateral (
      select distinct on ((s.starts_at at time zone 'Europe/Nicosia')::date) s.id
        from public.class_sessions s join public.class_types t on t.id = s.class_type_id
       where t.kind <> 'event' and s.status = 'scheduled'
         and (s.starts_at at time zone 'Europe/Nicosia')::date between (now() at time zone 'Europe/Nicosia')::date
                                                                   and (now() at time zone 'Europe/Nicosia')::date + 27
         and not exists (select 1 from public.bookings b join public.class_sessions s2 on s2.id = b.session_id
                          where b.profile_id = m.id and b.status = 'confirmed'
                            and (s2.starts_at at time zone 'Europe/Nicosia')::date = (s.starts_at at time zone 'Europe/Nicosia')::date)
         and (select count(*) from public.bookings b where b.session_id = s.id and b.status = 'confirmed') < s.capacity
       order by (s.starts_at at time zone 'Europe/Nicosia')::date, s.starts_at
    ) x
   where m.email = 'maria@example.com';
  update public.health_notes h set note = null
    from public.profiles p where p.id = h.profile_id and p.email = 'maria@example.com';
  update public.health_notes h set note = '20 weeks pregnant. Doctor''s note received.'
    from public.profiles p where p.id = h.profile_id and p.email like '%@example.com' and h.note like '%supine%';
  insert into public.health_history (profile_id, conditions, details, bp_meds, created_at)
  select id, '{back}', 'Lower back ache after long days at the desk.', false, now() - interval '50 days'
    from public.profiles where email = 'maria@example.com'
     and not exists (select 1 from public.health_history h where h.profile_id = profiles.id);
  insert into public.health_history (profile_id, conditions, details, pregnancy, pregnancy_weeks, bp_meds, clearance_needed, created_at)
  select id, '{pregnancy,back}', 'Lower back ache since the second trimester.', 'current', 20, false, true, now() - interval '3 days'
    from public.profiles where email = 'maria@example.com'
     and (select count(*) from public.health_history h where h.profile_id = profiles.id) = 1;
  -- Elena's emergency contact is her husband.
  update public.profiles set emergency_contact_relation = 'Husband' where email = 'elena@example.com' and emergency_contact_relation is null;
$$;

select public.seed_demo_profiles();
