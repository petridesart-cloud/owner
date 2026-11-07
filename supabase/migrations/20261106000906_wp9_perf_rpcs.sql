-- WP9 performance: one-query answers instead of big client-side scans (A-022, A-050, A-051, A-100).
-- PostgREST returns at most 1,000 rows, so anything that grows with the studio's history is summed in SQL.

-- Availability: optional events-only and single-session variants, and whether the class type is private.
drop function if exists public.session_availability(timestamptz, timestamptz);
create or replace function public.session_availability(
  p_from timestamptz, p_to timestamptz, p_events_only boolean default false, p_id uuid default null
) returns table (
  id uuid, class_type_id uuid, type_slug text, type_name text, kind public.class_kind, credit_kind public.credit_kind,
  title text, description text, starts_at timestamptz, ends_at timestamptz, capacity int, spots_left int,
  waitlist_count int, price_cents int, location text, status public.session_status, private boolean
)
language sql stable security definer set search_path = public as $$
  select s.id, s.class_type_id, ct.slug, ct.name, ct.kind, ct.credit_kind,
         coalesce(s.title, ct.name), coalesce(s.description, ct.description), s.starts_at, s.ends_at,
         s.capacity, greatest(s.capacity - public.spots_taken(s.id), 0),
         (select count(*)::int from public.waitlist_entries w where w.session_id = s.id and w.status in ('waiting','offered')),
         coalesce(s.price_cents, ct.price_cents), coalesce(s.location, ct.default_location), s.status, ct.private
    from public.class_sessions s join public.class_types ct on ct.id = s.class_type_id
   where (p_id is null or s.id = p_id)
     and (p_id is not null or (s.starts_at >= p_from and s.starts_at < p_to))
     and (not p_events_only or ct.kind = 'event')
   order by s.starts_at
$$;
revoke execute on function public.session_availability(timestamptz, timestamptz, boolean, uuid) from public, anon, authenticated;
grant execute on function public.session_availability(timestamptz, timestamptz, boolean, uuid) to service_role;

-- Each person's first class ever (a confirmed, no-show or late-cancelled booking), for the roster's "First class" flag.
create or replace function public.first_class_at(p_ids uuid[]) returns table (profile_id uuid, first_class timestamptz)
language sql stable security definer set search_path = public as $$
  select b.profile_id, min(s.starts_at)
    from public.bookings b join public.class_sessions s on s.id = b.session_id
   where b.profile_id = any(p_ids) and b.status in ('confirmed', 'no_show', 'late_cancelled')
   group by b.profile_id
$$;
revoke execute on function public.first_class_at(uuid[]) from public, anon, authenticated;
grant execute on function public.first_class_at(uuid[]) to service_role;

-- Paid money for one studio year, by month and method (Stats), summed in SQL.
create or replace function public.payments_by_method(p_year int) returns table (month text, method text, total_cents bigint)
language sql stable security definer set search_path = public as $$
  select to_char(p.paid_at at time zone (public.settings()).timezone, 'YYYY-MM'),
         coalesce(p.method, case when p.provider = 'offline' then 'cash' else 'online' end),
         sum(p.amount_cents)::bigint
    from public.payments p
   where p.status = 'paid'
     and p.paid_at >= (make_date(p_year, 1, 1)::timestamp at time zone (public.settings()).timezone)
     and p.paid_at <  (make_date(p_year + 1, 1, 1)::timestamp at time zone (public.settings()).timezone)
   group by 1, 2
$$;
revoke execute on function public.payments_by_method(int) from public, anon, authenticated;
grant execute on function public.payments_by_method(int) to service_role;

-- Which of these clients-only events this person can NOT open (everyone, when nobody is signed in).
create or replace function public.locked_events(p_profile uuid, p_ids uuid[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.id from public.class_sessions s
   where s.id = any(p_ids) and s.clients_only
     and (p_profile is null or not public.can_access_event(p_profile, s.id))
$$;
revoke execute on function public.locked_events(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.locked_events(uuid, uuid[]) to service_role;

-- "Active" clients (her rule): classes left in a package that hasn't expired, or a paid / free / studio-added class coming up.
create or replace function public.active_client_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where p.role = 'client' and p.deleted_at is null
     and (exists (select 1 from public.credit_lots l where l.profile_id = p.id and l.remaining > 0 and (l.expires_at is null or l.expires_at > now()))
       or exists (select 1 from public.bookings b join public.class_sessions s on s.id = b.session_id
                   left join public.payments pay on pay.id = b.payment_id
                  where b.profile_id = p.id and b.status = 'confirmed' and s.starts_at > now()
                    and (b.paid_with <> 'pay_at_studio' or pay.status = 'paid')))
$$;
revoke execute on function public.active_client_ids() from public, anon, authenticated;
grant execute on function public.active_client_ids() to service_role;
