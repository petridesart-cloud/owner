-- Demo seed: an event without a title made the clients-only update write null (it failed on the demo,
-- where 20261025001300 was fixed in place before it applied). Same function everywhere from here.
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
     set clients_only = coalesce(s.title = 'Brunch & Pilates', false),
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
