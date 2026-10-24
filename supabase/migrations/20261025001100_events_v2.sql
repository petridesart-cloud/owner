-- Round-2 notes: events she fully customises, clients-only events, an archive with her own words.

alter table public.class_sessions
  add column clients_only boolean not null default false, -- only existing clients can see the details and book
  add column what_to_bring text,                           -- events: one item per line; empty = section hidden
  add column event_policy text,                            -- events: her own terms, shown instead of the studio policy
  add column recap text;                                   -- past events: her short description for the archive

-- Optional intro on the Events page.
alter table public.site_content drop constraint site_content_key_check;
alter table public.site_content add constraint site_content_key_check
  check (key in ('studio_rules', 'payments_policy', 'what_to_bring', 'magic_text', 'studio_text', 'events_intro'));

-- A "client" is someone who has bought something, been given classes, or come to a class.
create or replace function public.is_studio_client(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payments where profile_id = p_profile and status = 'paid')
      or exists (select 1 from public.credit_lots where profile_id = p_profile)
      or exists (select 1 from public.bookings b join public.class_sessions s on s.id = b.session_id
                  where b.profile_id = p_profile and b.status in ('confirmed', 'no_show') and s.starts_at < now())
$$;
revoke execute on function public.is_studio_client(uuid) from public, anon, authenticated;
grant execute on function public.is_studio_client(uuid) to service_role;

-- Clients-only events: refuse online bookings and waitlist joins from anyone else.
-- The studio can still add anyone by hand (source = 'manual').
create or replace function public.guard_clients_only() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'bookings' then
    if new.source <> 'online' then return new; end if;
  end if;
  if (select clients_only from public.class_sessions where id = new.session_id)
     and not public.is_studio_client(new.profile_id) then
    raise exception 'clients_only' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger bookings_clients_only before insert on public.bookings
  for each row execute function public.guard_clients_only();
create trigger waitlist_clients_only before insert on public.waitlist_entries
  for each row execute function public.guard_clients_only();

-- Demo: the brunch is for clients only, the past SUP has a recap, events carry their own terms.
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
$$;

select public.seed_demo_profiles();
