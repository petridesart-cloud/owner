-- WP5 (A-018, A-049): the tick's health is recorded honestly, and its reminder / low-credit lists come
-- from SQL in one query each instead of one round trip per booking.

-- ── A-018: last successful tick and the last error ──────────────────────────────────────
-- last_cron_tick_at = the scheduler called (written at the end of the run);
-- last_tick_ok_at   = every step of the last run worked; last_tick_error = which steps failed (null when fine).
alter table public.studio_settings
  add column if not exists last_tick_ok_at timestamptz,
  add column if not exists last_tick_error text;

-- ── A-049: due reminders ────────────────────────────────────────────────────────────────
-- Confirmed bookings in scheduled classes starting in (now + next smaller offset, now + p_offset],
-- for clients who keep reminders on, booked before the reminder was due, and not reminded yet
-- (anti-join on the Outbox dedupe key; failed rows are resent by the retry step, not here).
-- p_now exists for tests (e.g. across a DST change); the app always uses now().
create or replace function public.due_reminders(p_offset int, p_now timestamptz default now())
returns table (booking_id uuid, session_id uuid, profile_id uuid, starts_at timestamptz)
language sql stable set search_path = public as $$
  with lower_bound as (
    select coalesce(max(o), 0) as m
      from unnest((select reminder_offsets_minutes from public.studio_settings where id = 1)) o
     where o < p_offset
  )
  select b.id, b.session_id, b.profile_id, s.starts_at
    from public.bookings b
    join public.class_sessions s on s.id = b.session_id
    join public.profiles p on p.id = b.profile_id
   cross join lower_bound lb
   where b.status = 'confirmed' and s.status = 'scheduled'
     and s.starts_at >  p_now + make_interval(mins => lb.m)
     and s.starts_at <= p_now + make_interval(mins => p_offset)
     and p.deleted_at is null and p.reminder_emails
     and (b.confirmed_at is null or b.confirmed_at <= s.starts_at - make_interval(mins => p_offset))
     and not exists (select 1 from public.notifications n where n.dedupe_key = 'reminder:' || p_offset || ':' || b.id || ':email')
   order by s.starts_at;
$$;
revoke all on function public.due_reminders(int, timestamptz) from public, anon, authenticated;
grant execute on function public.due_reminders(int, timestamptz) to service_role;

-- ── A-049: clients with exactly one usable class left of a kind, not told yet ─────────
-- lot_ids is the sorted id list used in the dedupe key ("low:<ids>"), byte order like JavaScript's sort.
create or replace function public.low_credit_groups()
returns table (profile_id uuid, credit_kind text, lot_ids text)
language sql stable set search_path = public as $$
  select g.profile_id, g.credit_kind, g.lot_ids from (
    select l.profile_id, l.credit_kind::text as credit_kind,
           string_agg(l.id::text, ',' order by l.id::text collate "C") as lot_ids, sum(l.remaining) as total
      from public.credit_lots l
     where l.remaining > 0 and (l.expires_at is null or l.expires_at > now())
     group by l.profile_id, l.credit_kind
  ) g
  where g.total = 1
    and not exists (select 1 from public.notifications n where n.dedupe_key = 'low:' || g.lot_ids || ':email');
$$;
revoke all on function public.low_credit_groups() from public, anon, authenticated;
grant execute on function public.low_credit_groups() to service_role;
